"""Schedule management Lambda handler - monthly/weekly view with GSI date range query."""
import logging
import re
import uuid

import auth
import response
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from db_client import get_table, get_dynamodb_client
from utils import now_iso, get_method_and_path
from router import Router
from validators import is_valid_iso_datetime, parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DATE_RANGE_INDEX = "DateRangeIndex"


# ---------- Helpers ----------

def _extract_event_id(path: str) -> str | None:
    match = re.search(r"/schedules/([^/]+)$", path)
    return match.group(1) if match else None


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


def _prev_month(year_month: str) -> str:
    """Return the previous month in YYYY-MM format."""
    y, m = int(year_month[:4]), int(year_month[5:7])
    if m == 1:
        return f"{y - 1}-12"
    return f"{y}-{m - 1:02d}"


def _query_bucket(table, year_month: str, start: str, end: str) -> list:
    """Query the GSI month bucket for events whose startDatetime is in [start, end], paginated."""
    kwargs = {
        "IndexName": DATE_RANGE_INDEX,
        "KeyConditionExpression": Key("gsi1pk").eq(f"SCHEDULE#{year_month}") & Key("gsi1sk").between(start, end),
    }
    items = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def _serialize_for_transact(item: dict) -> dict:
    """Convert Python dict to DynamoDB AttributeValue format for transact_write_items."""
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


# ---------- Route Handlers ----------

def list_schedules(event: dict) -> dict:
    """List schedules for a month or week via GSI DateRangeIndex.

    Monthly view (⑨ fix): also queries the previous month bucket to include
    multi-day events whose startDatetime is in the previous month but
    endDatetime extends into the requested month.

    Weekly view (⑧ fix): when the week spans two months, queries both month
    buckets and merges results to avoid missing events in the latter half.
    """
    params = event.get("queryStringParameters") or {}
    year_month = params.get("month")   # e.g. "2026-03"
    start_date = params.get("start")   # e.g. "2026-03-01T00:00:00"
    end_date   = params.get("end")     # e.g. "2026-03-07T23:59:59"

    table = get_table()
    results = []

    if year_month:
        month_start = f"{year_month}-01T00:00:00"
        y, m = int(year_month[:4]), int(year_month[5:7])
        next_m = m + 1 if m < 12 else 1
        next_y = y if m < 12 else y + 1
        month_end = f"{next_y}-{next_m:02d}-01T00:00:00"

        # Current month events
        items = _query_bucket(table, year_month, month_start, month_end)
        seen_ids = {item.get("eventId") for item in items}

        # ⑨ Previous month events that extend into this month
        prev = _prev_month(year_month)
        prev_kwargs = {
            "IndexName": DATE_RANGE_INDEX,
            "KeyConditionExpression": Key("gsi1pk").eq(f"SCHEDULE#{prev}"),
            "FilterExpression": Attr("endDatetime").gte(month_start),
        }
        prev_resp = table.query(**prev_kwargs)
        for item in prev_resp.get("Items", []):
            if item.get("eventId") not in seen_ids:
                items.append(item)

        results = [_item_to_event(item) for item in items]

    elif start_date and end_date:
        start_ym = start_date[:7]
        end_ym = end_date[:7]

        items = _query_bucket(table, start_ym, start_date, end_date)

        if start_ym != end_ym:
            # ⑧ Week spans months — also query end month bucket
            seen_ids = {item.get("eventId") for item in items}
            for item in _query_bucket(table, end_ym, start_date, end_date):
                if item.get("eventId") not in seen_ids:
                    items.append(item)

        results = [_item_to_event(item) for item in items]

    else:
        return response.bad_request("Provide 'month' (YYYY-MM) or 'start'+'end' query parameters")

    return response.ok({"events": results, "count": len(results)})


def get_schedule(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    _, path = get_method_and_path(event)
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
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        # GSI1 for DateRangeIndex
        "gsi1pk": f"SCHEDULE#{year_month}",
        "gsi1sk": body["startDatetime"],
    }

    get_table().put_item(Item=item)
    return response.created(_item_to_event(item))


def update_schedule(event: dict) -> dict:
    """Update a schedule event.

    ⑩ isPublic change: DynamoDB cannot update the PK in place.
    When isPublic flips, we atomically Delete the old item and Put a new one
    with the corrected PK so access control actually changes.
    """
    user_id = auth.get_user_id(event)
    _, path = get_method_and_path(event)
    event_id = _extract_event_id(path)
    body = parse_body(event)

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

    # Determine if isPublic changes (requires PK change)
    new_is_public = bool(body["isPublic"]) if "isPublic" in body else item.get("isPublic", True)
    is_public_changed = "isPublic" in body and new_is_public != item.get("isPublic", True)

    if is_public_changed:
        # ⑩ Build a fully updated copy of the item with the new PK
        new_pk = "SCHEDULE#PUBLIC" if new_is_public else f"SCHEDULE#{user_id}"
        new_item = dict(item)
        new_item["PK"] = new_pk
        new_item["isPublic"] = new_is_public
        new_item["updatedAt"] = now_iso()

        for field, max_len in [("title", 200), ("description", 2000), ("location", 500)]:
            if field in body:
                new_item[field] = sanitize_string(body[field], max_len)
        if "allDay" in body:
            new_item["allDay"] = bool(body["allDay"])
        if "startDatetime" in body:
            if not is_valid_iso_datetime(body["startDatetime"]):
                return response.bad_request("startDatetime must be ISO-8601")
            new_item["startDatetime"] = body["startDatetime"]
            new_item["gsi1pk"] = f"SCHEDULE#{body['startDatetime'][:7]}"
            new_item["gsi1sk"] = body["startDatetime"]
        if "endDatetime" in body:
            if not is_valid_iso_datetime(body["endDatetime"]):
                return response.bad_request("endDatetime must be ISO-8601")
            new_item["endDatetime"] = body["endDatetime"]

        dynamodb = get_dynamodb_client()
        try:
            dynamodb.transact_write_items(
                TransactItems=[
                    {
                        "Delete": {
                            "TableName": table.name,
                            "Key": {
                                "PK": {"S": item["PK"]},
                                "SK": {"S": f"EVENT#{event_id}"},
                            },
                        }
                    },
                    {
                        "Put": {
                            "TableName": table.name,
                            "Item": _serialize_for_transact(new_item),
                        }
                    },
                ]
            )
        except ClientError:
            logger.exception("TransactWriteItems failed on update_schedule (isPublic change)")
            return response.server_error("Failed to update schedule")

        return response.ok({"eventId": event_id, "updated": True})

    # Normal update — PK does not change
    update_expr_parts = ["updatedAt = :updatedAt"]
    expr_values = {":updatedAt": now_iso()}

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
    _, path = get_method_and_path(event)
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

_router = Router()
_router.add("GET",    r".*/schedules$",          list_schedules)
_router.add("POST",   r".*/schedules$",          create_schedule)
_router.add("GET",    r".*/schedules/[^/]+$",    get_schedule)
_router.add("PUT",    r".*/schedules/[^/]+$",    update_schedule)
_router.add("DELETE", r".*/schedules/[^/]+$",    delete_schedule)


def lambda_handler(event: dict, context) -> dict:
    logger.info("Schedules event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
