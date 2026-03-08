"""Schedule management Lambda handler - monthly/weekly view with GSI date range query."""
import logging
import re
import uuid
from datetime import datetime, timezone

import auth
import response
from boto3.dynamodb.conditions import Key
from db_client import get_table
from validators import is_valid_iso_datetime, parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DATE_RANGE_INDEX = "DateRangeIndex"


# ---------- Helpers ----------

def _get_method_and_path(event: dict) -> tuple[str, str]:
    ctx = event.get("requestContext", {}).get("http", {})
    return ctx.get("method", ""), ctx.get("path", "")


def _extract_event_id(path: str) -> str | None:
    match = re.search(r"/schedules/([^/]+)$", path)
    return match.group(1) if match else None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _item_to_event(item: dict) -> dict:
    return {
        "eventId": item.get("eventId"),
        "title": item.get("title"),
        "description": item.get("description", ""),
        "startDatetime": item.get("startDatetime"),
        "endDatetime": item.get("endDatetime"),
        "allDay": item.get("allDay", False),
        "location": item.get("location", ""),
        "isPublic": item.get("isPublic", True),
        "createdBy": item.get("createdBy"),
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
    }


# ---------- Route Handlers ----------

def list_schedules(event: dict) -> dict:
    """List schedules for a month or week via GSI DateRangeIndex."""
    params = event.get("queryStringParameters") or {}
    year_month = params.get("month")   # e.g. "2026-03"
    start_date = params.get("start")   # e.g. "2026-03-01T00:00:00"
    end_date   = params.get("end")     # e.g. "2026-03-07T23:59:59"

    table = get_table()
    results = []

    if year_month:
        # Monthly view: gsi1pk = "SCHEDULE#2026-03"
        gsi_pk = f"SCHEDULE#{year_month}"
        start = f"{year_month}-01T00:00:00"
        # Calculate last day of month
        y, m = int(year_month[:4]), int(year_month[5:7])
        next_m = m + 1 if m < 12 else 1
        next_y = y if m < 12 else y + 1
        end = f"{next_y}-{next_m:02d}-01T00:00:00"
        resp = table.query(
            IndexName=DATE_RANGE_INDEX,
            KeyConditionExpression=Key("gsi1pk").eq(gsi_pk) & Key("gsi1sk").between(start, end),
        )
        results = [_item_to_event(item) for item in resp.get("Items", [])]

    elif start_date and end_date:
        # Weekly view: query by range, derive month bucket from start_date
        year_month_key = start_date[:7]
        gsi_pk = f"SCHEDULE#{year_month_key}"
        resp = table.query(
            IndexName=DATE_RANGE_INDEX,
            KeyConditionExpression=Key("gsi1pk").eq(gsi_pk) & Key("gsi1sk").between(start_date, end_date),
        )
        results = [_item_to_event(item) for item in resp.get("Items", [])]

    else:
        return response.bad_request("Provide 'month' (YYYY-MM) or 'start'+'end' query parameters")

    # Also include public schedule events the caller can see
    return response.ok({"events": results, "count": len(results)})


def get_schedule(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    _, path = _get_method_and_path(event)
    event_id = _extract_event_id(path)

    table = get_table()
    resp = table.get_item(Key={"PK": f"SCHEDULE#{user_id}", "SK": f"EVENT#{event_id}"})
    item = resp.get("Item")

    if not item:
        # Try public schedules
        resp = table.get_item(Key={"PK": "SCHEDULE#PUBLIC", "SK": f"EVENT#{event_id}"})
        item = resp.get("Item")

    if not item:
        return response.not_found("Schedule event")

    if not item.get("isPublic") and item.get("createdBy") != user_id:
        if not auth.is_admin(event):
            return response.forbidden()

    return response.ok(_item_to_event(item))


def create_schedule(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    body = parse_body(event)

    missing = require_fields(body, ["title", "startDatetime", "endDatetime"])
    if missing:
        return response.bad_request(f"Missing required fields: {', '.join(missing)}")

    if not is_valid_iso_datetime(body["startDatetime"]) or not is_valid_iso_datetime(body["endDatetime"]):
        return response.bad_request("startDatetime and endDatetime must be ISO-8601 format")

    if body["startDatetime"] >= body["endDatetime"] and not body.get("allDay"):
        return response.bad_request("endDatetime must be after startDatetime")

    event_id = str(uuid.uuid4())
    is_public = body.get("isPublic", True)
    pk = "SCHEDULE#PUBLIC" if is_public else f"SCHEDULE#{user_id}"
    year_month = body["startDatetime"][:7]

    item = {
        "PK": pk,
        "SK": f"EVENT#{event_id}",
        "entityType": "SCHEDULE",
        "eventId": event_id,
        "title": sanitize_string(body["title"], 200),
        "description": sanitize_string(body.get("description", ""), 2000),
        "startDatetime": body["startDatetime"],
        "endDatetime": body["endDatetime"],
        "allDay": bool(body.get("allDay", False)),
        "location": sanitize_string(body.get("location", ""), 500),
        "isPublic": is_public,
        "createdBy": user_id,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        # GSI1 for DateRangeIndex
        "gsi1pk": f"SCHEDULE#{year_month}",
        "gsi1sk": body["startDatetime"],
    }

    get_table().put_item(Item=item)
    return response.created(_item_to_event(item))


def update_schedule(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    _, path = _get_method_and_path(event)
    event_id = _extract_event_id(path)
    body = parse_body(event)

    table = get_table()
    # Find the item (could be public or private)
    item = None
    for pk in (f"SCHEDULE#{user_id}", "SCHEDULE#PUBLIC"):
        resp = table.get_item(Key={"PK": pk, "SK": f"EVENT#{event_id}"})
        if resp.get("Item"):
            item = resp["Item"]
            break

    if not item:
        return response.not_found("Schedule event")

    if item.get("createdBy") != user_id and not auth.is_admin(event):
        return response.forbidden()

    update_expr_parts = ["updatedAt = :updatedAt"]
    expr_values = {":updatedAt": _now_iso()}

    for field, attr in [("title", "title"), ("description", "description"),
                        ("location", "location"), ("allDay", "allDay")]:
        if field in body:
            update_expr_parts.append(f"{attr} = :{attr}")
            val = body[field]
            if isinstance(val, str):
                val = sanitize_string(val)
            expr_values[f":{attr}"] = val

    if "startDatetime" in body:
        if not is_valid_iso_datetime(body["startDatetime"]):
            return response.bad_request("startDatetime must be ISO-8601")
        update_expr_parts.append("startDatetime = :startDatetime")
        update_expr_parts.append("gsi1sk = :startDatetime")
        expr_values[":startDatetime"] = body["startDatetime"]
        year_month = body["startDatetime"][:7]
        update_expr_parts.append("gsi1pk = :gsi1pk")
        expr_values[":gsi1pk"] = f"SCHEDULE#{year_month}"

    if "endDatetime" in body:
        if not is_valid_iso_datetime(body["endDatetime"]):
            return response.bad_request("endDatetime must be ISO-8601")
        update_expr_parts.append("endDatetime = :endDatetime")
        expr_values[":endDatetime"] = body["endDatetime"]

    table.update_item(
        Key={"PK": item["PK"], "SK": f"EVENT#{event_id}"},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeValues=expr_values,
    )
    return response.ok({"eventId": event_id, "updated": True})


def delete_schedule(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    _, path = _get_method_and_path(event)
    event_id = _extract_event_id(path)

    table = get_table()
    item = None
    for pk in (f"SCHEDULE#{user_id}", "SCHEDULE#PUBLIC"):
        resp = table.get_item(Key={"PK": pk, "SK": f"EVENT#{event_id}"})
        if resp.get("Item"):
            item = resp["Item"]
            break

    if not item:
        return response.not_found("Schedule event")

    if item.get("createdBy") != user_id and not auth.is_admin(event):
        return response.forbidden()

    table.delete_item(Key={"PK": item["PK"], "SK": f"EVENT#{event_id}"})
    return response.no_content()


# ---------- Router ----------

def lambda_handler(event: dict, context) -> dict:
    logger.info("Schedules event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))

    method, path = _get_method_and_path(event)

    try:
        if method == "OPTIONS":
            return response.ok({})

        if path.endswith("/schedules"):
            if method == "GET":
                return list_schedules(event)
            if method == "POST":
                return create_schedule(event)

        if re.match(r".*/schedules/[^/]+$", path):
            if method == "GET":
                return get_schedule(event)
            if method == "PUT":
                return update_schedule(event)
            if method == "DELETE":
                return delete_schedule(event)

        return response.not_found("Endpoint")

    except Exception as e:
        logger.exception("Unhandled error in schedules handler")
        return response.server_error(str(e))
