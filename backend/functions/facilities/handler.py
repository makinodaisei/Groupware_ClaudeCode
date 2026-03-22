"""Facility reservation Lambda handler - exclusive control via DynamoDB TransactWriteItems."""
import logging
import os
import re
import uuid

import auth
import response
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from db_client import get_table, get_dynamodb_client
from validators import is_valid_iso_datetime, parse_body, require_fields, sanitize_string
from utils import now_iso, get_method_and_path
from router import Router

logger = logging.getLogger()
logger.setLevel(logging.INFO)

RESERVATION_BY_DATE_INDEX = "ReservationByDateIndex"


# ---------- Helpers ----------

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


def _item_to_facility(item: dict) -> dict:
    return {
        "facilityId": item.get("facilityId"),
        "name": item.get("name"),
        "description": item.get("description", ""),
        "capacity": int(item.get("capacity", 1)),
        "location": item.get("location", ""),
        "parentId": item.get("parentId", "ROOT"),
        "facilityType": item.get("facilityType", "facility"),
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


def _query_all(table, **kwargs) -> list:
    """Query DynamoDB with automatic pagination."""
    items = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def _has_time_overlap(table, facility_id: str, date_key: str, start: str, end: str) -> bool:
    """Return True if any existing reservation on date_key overlaps the interval [start, end).

    Overlap condition: existing.start < new.end AND existing.end > new.start
    Note: compares ISO-8601 strings lexicographically — callers must use a consistent
    timezone offset (e.g. always +09:00 or always Z) for correct results.
    """
    items = _query_all(
        table,
        KeyConditionExpression=Key("PK").eq(f"FACILITY#{facility_id}") & Key("SK").begins_with(f"RESERVATION#{date_key}"),
    )
    for item in items:
        ex_start = item.get("startDatetime", "")
        ex_end = item.get("endDatetime", "")
        if ex_start < end and ex_end > start:
            return True
    return False


# ---------- Facility CRUD ----------

def list_facilities(event: dict) -> dict:
    table = get_table()
    resp = table.scan(
        FilterExpression=Attr("PK").begins_with("FACILITY#") & Attr("SK").eq("#METADATA"),
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

    facility_type = body.get("facilityType", "facility")
    if facility_type not in ("group", "facility"):
        return response.bad_request("facilityType must be 'group' or 'facility'")

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
        "parentId": body.get("parentId", "ROOT"),
        "facilityType": facility_type,
        "createdAt": now_iso(),
        "createdBy": auth.get_user_id(event),
    }
    get_table().put_item(Item=item)
    return response.created(_item_to_facility(item))


def update_facility(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    _, path = get_method_and_path(event)
    facility_id, _ = _extract_ids(path)

    table = get_table()
    resp = table.get_item(Key={"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"})
    if not resp.get("Item"):
        return response.not_found("Facility")

    body = parse_body(event)
    update_expr_parts = []
    expr_attr_values = {}
    expr_attr_names = {}

    if "name" in body:
        update_expr_parts.append("#name = :name")
        expr_attr_names["#name"] = "name"
        expr_attr_values[":name"] = sanitize_string(body["name"], 200)
    if "description" in body:
        update_expr_parts.append("description = :desc")
        expr_attr_values[":desc"] = sanitize_string(body["description"], 1000)
    if "capacity" in body:
        update_expr_parts.append("#cap = :cap")
        expr_attr_names["#cap"] = "capacity"
        expr_attr_values[":cap"] = int(body["capacity"])
    if "location" in body:
        update_expr_parts.append("#loc = :loc")
        expr_attr_names["#loc"] = "location"
        expr_attr_values[":loc"] = sanitize_string(body["location"], 500)

    if not update_expr_parts:
        return response.bad_request("No fields to update")

    kwargs = {
        "Key": {"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"},
        "UpdateExpression": "SET " + ", ".join(update_expr_parts),
        "ExpressionAttributeValues": expr_attr_values,
        "ReturnValues": "ALL_NEW",
    }
    if expr_attr_names:
        kwargs["ExpressionAttributeNames"] = expr_attr_names

    result = table.update_item(**kwargs)
    return response.ok(_item_to_facility(result["Attributes"]))


def delete_facility(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    _, path = get_method_and_path(event)
    facility_id, _ = _extract_ids(path)
    table = get_table()

    # 子施設チェック (Limit caps items examined per page; pagination stops on first match)
    children = table.scan(
        FilterExpression=Attr("parentId").eq(facility_id) & Attr("SK").eq("#METADATA"),
        Limit=100,
    )
    if children.get("Items"):
        return response.conflict("Cannot delete a group that has child facilities")

    # 予約チェック
    reservations = table.query(
        KeyConditionExpression=Key("PK").eq(f"FACILITY#{facility_id}") & Key("SK").begins_with("RESERVATION#"),
        Limit=1,
    )
    if reservations.get("Items"):
        return response.conflict("Cannot delete a facility that has reservations")

    table.delete_item(Key={"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"})
    return response.no_content()


# ---------- Reservation CRUD ----------

def list_reservations(event: dict) -> dict:
    """List reservations for a facility or by date via ReservationByDateIndex."""
    _, path = get_method_and_path(event)
    facility_id, _ = _extract_ids(path)
    params = event.get("queryStringParameters") or {}
    date = params.get("date")  # YYYY-MM-DD

    table = get_table()

    if date:
        # Query by date across all facilities (paginated)
        items = _query_all(
            table,
            IndexName=RESERVATION_BY_DATE_INDEX,
            KeyConditionExpression=Key("gsi2pk").eq(f"RESERVATION#{date}"),
        )
        reservations = [_item_to_reservation(item) for item in items]
    elif facility_id:
        # Query by facility (paginated)
        items = _query_all(
            table,
            KeyConditionExpression=Key("PK").eq(f"FACILITY#{facility_id}") & Key("SK").begins_with("RESERVATION#"),
        )
        reservations = [_item_to_reservation(item) for item in items]
    else:
        return response.bad_request("Provide facilityId in path or 'date' query parameter")

    return response.ok({"reservations": reservations})


def create_reservation(event: dict) -> dict:
    """Create a reservation with exclusive control via TransactWriteItems.

    Two-layer protection:
      1. Pre-check: _has_time_overlap queries existing reservations and rejects
         overlapping time ranges before writing (catches 10:00-12:00 vs 11:00-13:00).
      2. Atomic LOCK: TransactWriteItems with attribute_not_exists(PK) on the LOCK item
         prevents exact same-start-time races between concurrent requests.

    The LOCK item has no TTL — it is deleted only when the reservation is deleted,
    so the timeslot remains protected for the lifetime of the reservation.

    Note: the pre-check has a small TOCTOU window for non-identical start times.
    For an internal groupware this is an acceptable MVP tradeoff.
    """
    user_id = auth.get_user_id(event)
    _, path = get_method_and_path(event)
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

    date_key = start[:10]  # YYYY-MM-DD
    start_time = start[11:16]  # HH:MM

    # ① Time-range overlap check (pre-write guard)
    if _has_time_overlap(table, facility_id, date_key, start, end):
        return response.conflict(
            f"The facility is already reserved during the requested time on {date_key}"
        )

    reservation_id = str(uuid.uuid4())

    # Lock SK encodes date+time; attribute_not_exists guard prevents same-start-time races
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
        "createdAt": now_iso(),
        # GSI2 for ReservationByDateIndex
        "gsi2pk": f"RESERVATION#{date_key}",
        "gsi2sk": f"{facility_id}#{start_time}",
    }

    lock_item = {
        "PK": f"FACILITY#{facility_id}",
        "SK": lock_sk,
        "entityType": "LOCK",
        "reservationId": reservation_id,
        # No TTL: LOCK persists for the lifetime of the reservation
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
    _, path = get_method_and_path(event)
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

    sk = item["SK"]
    date_time = sk.replace("RESERVATION#", "").rsplit("#", 1)[0]
    lock_sk = f"LOCK#{date_time}"

    # ③ Atomically delete reservation and its LOCK together
    dynamodb = get_dynamodb_client()
    try:
        dynamodb.transact_write_items(
            TransactItems=[
                {
                    "Delete": {
                        "TableName": table.name,
                        "Key": {
                            "PK": {"S": f"FACILITY#{facility_id}"},
                            "SK": {"S": sk},
                        },
                    }
                },
                {
                    "Delete": {
                        "TableName": table.name,
                        "Key": {
                            "PK": {"S": f"FACILITY#{facility_id}"},
                            "SK": {"S": lock_sk},
                        },
                    }
                },
            ]
        )
    except ClientError:
        logger.exception("TransactWriteItems failed on delete reservation")
        return response.server_error("Failed to delete reservation")

    return response.no_content()


# ---------- Router ----------

_router = Router()
_router.add("GET",    r".*/facilities$",                               list_facilities)
_router.add("POST",   r".*/facilities$",                               create_facility)
_router.add("GET",    r".*/facilities/[^/]+$",                         get_facility)
_router.add("PUT",    r".*/facilities/[^/]+$",                         update_facility)
_router.add("DELETE", r".*/facilities/[^/]+$",                         delete_facility)
_router.add("GET",    r".*/facilities/[^/]+/reservations$",            list_reservations)
_router.add("POST",   r".*/facilities/[^/]+/reservations$",            create_reservation)
_router.add("DELETE", r".*/facilities/[^/]+/reservations/[^/]+$",      delete_reservation)


def lambda_handler(event: dict, context) -> dict:
    logger.info("Facilities event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
