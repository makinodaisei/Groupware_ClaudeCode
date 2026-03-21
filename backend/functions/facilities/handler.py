"""Facility reservation Lambda handler - exclusive control via DynamoDB TransactWriteItems."""
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

import auth
import response
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from db_client import get_table, get_dynamodb_client
from validators import is_valid_iso_datetime, parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

RESERVATION_BY_DATE_INDEX = "ReservationByDateIndex"
LOCK_TTL_SECONDS = 300  # 5 minutes lock expiry for cleanup


# ---------- Helpers ----------

def _get_method_and_path(event: dict) -> tuple[str, str]:
    ctx = event.get("requestContext", {}).get("http", {})
    return ctx.get("method", ""), ctx.get("path", "")


def _extract_ids(path: str) -> tuple[str | None, str | None]:
    """Extract facilityId and optional reservationId from path."""
    match = re.search(r"/facilities/([^/]+)/reservations/([^/]+)$", path)
    if match:
        return match.group(1), match.group(2)
    match = re.search(r"/facilities/([^/]+)/reservations$", path)
    if match:
        return match.group(1), None
    match = re.search(r"/facilities/([^/]+)$", path)
    if match:
        return match.group(1), None
    return None, None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _unix_timestamp(dt: datetime) -> int:
    return int(dt.timestamp())


def _item_to_facility(item: dict) -> dict:
    return {
        "facilityId": item.get("facilityId"),
        "name": item.get("name"),
        "description": item.get("description", ""),
        "capacity": item.get("capacity", 1),
        "location": item.get("location", ""),
        "createdAt": item.get("createdAt"),
    }


def _item_to_reservation(item: dict) -> dict:
    return {
        "reservationId": item.get("reservationId"),
        "facilityId": item.get("facilityId"),
        "title": item.get("title"),
        "startDatetime": item.get("startDatetime"),
        "endDatetime": item.get("endDatetime"),
        "reservedBy": item.get("reservedBy"),
        "attendees": item.get("attendees", []),
        "notes": item.get("notes", ""),
        "createdAt": item.get("createdAt"),
    }


# ---------- Facility CRUD ----------

def list_facilities(event: dict) -> dict:
    table = get_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").begins_with("FACILITY#") & Key("SK").eq("#METADATA"),
    )
    # DynamoDB doesn't support begins_with on PK directly; use scan with filter
    resp = table.scan(
        FilterExpression="SK = :meta AND begins_with(PK, :prefix)",
        ExpressionAttributeValues={":meta": "#METADATA", ":prefix": "FACILITY#"},
    )
    facilities = [_item_to_facility(item) for item in resp.get("Items", [])]
    return response.ok({"facilities": facilities})


def get_facility(event: dict) -> dict:
    facility_id, _ = _extract_ids(event.get("requestContext", {}).get("http", {}).get("path", ""))
    table = get_table()
    resp = table.get_item(Key={"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"})
    item = resp.get("Item")
    if not item:
        return response.not_found("Facility")
    return response.ok(_item_to_facility(item))


def create_facility(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    body = parse_body(event)
    missing = require_fields(body, ["name"])
    if missing:
        return response.bad_request(f"Missing required fields: {', '.join(missing)}")

    facility_id = str(uuid.uuid4())
    item = {
        "PK": f"FACILITY#{facility_id}",
        "SK": "#METADATA",
        "entityType": "FACILITY",
        "facilityId": facility_id,
        "name": sanitize_string(body["name"], 200),
        "description": sanitize_string(body.get("description", ""), 1000),
        "capacity": int(body.get("capacity", 1)),
        "location": sanitize_string(body.get("location", ""), 500),
        "createdAt": _now_iso(),
        "createdBy": auth.get_user_id(event),
    }
    get_table().put_item(Item=item)
    return response.created(_item_to_facility(item))


# ---------- Reservation CRUD ----------

def list_reservations(event: dict) -> dict:
    """List reservations for a facility or by date via ReservationByDateIndex."""
    _, path = _get_method_and_path(event)
    facility_id, _ = _extract_ids(path)
    params = event.get("queryStringParameters") or {}
    date = params.get("date")  # YYYY-MM-DD

    table = get_table()

    if date:
        # Query by date across all facilities
        resp = table.query(
            IndexName=RESERVATION_BY_DATE_INDEX,
            KeyConditionExpression=Key("gsi2pk").eq(f"RESERVATION#{date}"),
        )
        reservations = [_item_to_reservation(item) for item in resp.get("Items", [])]
    elif facility_id:
        # Query by facility
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(f"FACILITY#{facility_id}") & Key("SK").begins_with("RESERVATION#"),
        )
        reservations = [_item_to_reservation(item) for item in resp.get("Items", [])]
    else:
        return response.bad_request("Provide facilityId in path or 'date' query parameter")

    return response.ok({"reservations": reservations})


def create_reservation(event: dict) -> dict:
    """Create a reservation with exclusive control via TransactWriteItems."""
    user_id = auth.get_user_id(event)
    _, path = _get_method_and_path(event)
    facility_id, _ = _extract_ids(path)

    body = parse_body(event)
    missing = require_fields(body, ["title", "startDatetime", "endDatetime"])
    if missing:
        return response.bad_request(f"Missing required fields: {', '.join(missing)}")

    start = body["startDatetime"]
    end = body["endDatetime"]
    if not is_valid_iso_datetime(start) or not is_valid_iso_datetime(end):
        return response.bad_request("startDatetime and endDatetime must be ISO-8601 format")
    if start >= end:
        return response.bad_request("endDatetime must be after startDatetime")

    # Verify facility exists
    table = get_table()
    facility_resp = table.get_item(Key={"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"})
    if not facility_resp.get("Item"):
        return response.not_found("Facility")

    reservation_id = str(uuid.uuid4())
    date_key = start[:10]  # YYYY-MM-DD
    start_time = start[11:16]  # HH:MM
    lock_expiry = _unix_timestamp(datetime.now(timezone.utc) + timedelta(seconds=LOCK_TTL_SECONDS))

    # Lock SK encodes date+time to enable range-based overlap detection
    lock_sk = f"LOCK#{date_key}T{start_time}"
    reservation_sk = f"RESERVATION#{date_key}T{start_time}#{reservation_id}"

    reservation_item = {
        "PK": f"FACILITY#{facility_id}",
        "SK": reservation_sk,
        "entityType": "RESERVATION",
        "reservationId": reservation_id,
        "facilityId": facility_id,
        "title": sanitize_string(body["title"], 200),
        "startDatetime": start,
        "endDatetime": end,
        "reservedBy": user_id,
        "attendees": body.get("attendees", []),
        "notes": sanitize_string(body.get("notes", ""), 2000),
        "createdAt": _now_iso(),
        # GSI2 for ReservationByDateIndex
        "gsi2pk": f"RESERVATION#{date_key}",
        "gsi2sk": f"{facility_id}#{start_time}",
    }

    lock_item = {
        "PK": f"FACILITY#{facility_id}",
        "SK": lock_sk,
        "entityType": "LOCK",
        "reservationId": reservation_id,
        "ttl": lock_expiry,
    }

    dynamodb = get_dynamodb_client()
    try:
        dynamodb.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": {
                            "PK": {"S": lock_item["PK"]},
                            "SK": {"S": lock_item["SK"]},
                            "entityType": {"S": "LOCK"},
                            "reservationId": {"S": reservation_id},
                            "ttl": {"N": str(lock_expiry)},
                        },
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
                {
                    "Put": {
                        "TableName": table.name,
                        "Item": _serialize_for_transact(reservation_item),
                    }
                },
            ]
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "TransactionCanceledException":
            reasons = e.response.get("CancellationReasons", [])
            if reasons and reasons[0].get("Code") == "ConditionalCheckFailed":
                return response.conflict(
                    f"The timeslot {date_key} {start_time} is already reserved for this facility"
                )
        logger.exception("TransactWriteItems failed")
        return response.server_error("Failed to create reservation")

    return response.created(_item_to_reservation(reservation_item))


def _serialize_for_transact(item: dict) -> dict:
    """Convert Python types to DynamoDB AttributeValue format for transact_write_items."""
    result = {}
    for k, v in item.items():
        if isinstance(v, str):
            result[k] = {"S": v}
        elif isinstance(v, bool):
            result[k] = {"BOOL": v}
        elif isinstance(v, (int, float)):
            result[k] = {"N": str(v)}
        elif isinstance(v, list):
            result[k] = {"L": [{"S": str(i)} for i in v]}
        else:
            result[k] = {"S": str(v)}
    return result


def delete_reservation(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    _, path = _get_method_and_path(event)
    facility_id, reservation_id = _extract_ids(path)

    table = get_table()
    # Find the reservation by scanning facility reservations
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"FACILITY#{facility_id}") & Key("SK").begins_with("RESERVATION#"),
        FilterExpression="reservationId = :rid",
        ExpressionAttributeValues={":rid": reservation_id},
    )
    items = resp.get("Items", [])
    if not items:
        return response.not_found("Reservation")

    item = items[0]
    if item.get("reservedBy") != user_id and not auth.is_admin(event):
        return response.forbidden()

    # Delete reservation and its lock
    sk = item["SK"]
    date_time = sk.replace("RESERVATION#", "").rsplit("#", 1)[0]
    lock_sk = f"LOCK#{date_time}"

    table.delete_item(Key={"PK": f"FACILITY#{facility_id}", "SK": sk})
    table.delete_item(Key={"PK": f"FACILITY#{facility_id}", "SK": lock_sk})

    return response.no_content()


# ---------- Router ----------

def lambda_handler(event: dict, context) -> dict:
    logger.info("Facilities event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))

    method, path = _get_method_and_path(event)

    try:
        if method == "OPTIONS":
            return response.ok({})

        # /facilities
        if re.match(r".*/facilities$", path):
            if method == "GET":
                return list_facilities(event)
            if method == "POST":
                return create_facility(event)

        # /facilities/{id}
        if re.match(r".*/facilities/[^/]+$", path):
            if method == "GET":
                return get_facility(event)

        # /facilities/{id}/reservations
        if re.match(r".*/facilities/[^/]+/reservations$", path):
            if method == "GET":
                return list_reservations(event)
            if method == "POST":
                return create_reservation(event)

        # /facilities/{id}/reservations/{rid}
        if re.match(r".*/facilities/[^/]+/reservations/[^/]+$", path):
            if method == "DELETE":
                return delete_reservation(event)

        return response.not_found("Endpoint")

    except Exception as e:
        logger.exception("Unhandled error in facilities handler")
        return response.server_error(str(e))
