"""Facility type master Lambda handler."""
import logging
import re
import uuid

import auth
import response
from db_client import get_table
from utils import now_iso, get_method_and_path
from router import Router
from validators import parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _extract_type_id(path: str) -> str | None:
    match = re.search(r"/facility-types/([^/]+)$", path)
    return match.group(1) if match else None


def _item_to_type(item: dict) -> dict:
    return {
        "typeId": item.get("typeId"),
        "name": item.get("name"),
        "description": item.get("description", ""),
        "isBookable": item.get("isBookable", True),
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
    }


def list_facility_types(event: dict) -> dict:
    table = get_table()
    resp = table.query(
        IndexName="DateRangeIndex",
        KeyConditionExpression="gsi1pk = :pk",
        ExpressionAttributeValues={":pk": "FACILITYTYPE"},
    )
    types = [_item_to_type(i) for i in resp.get("Items", [])]
    return response.ok({"facilityTypes": types})


def create_facility_type(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    body = parse_body(event)
    err = require_fields(body, ["name"])
    if err:
        return err

    type_id = str(uuid.uuid4())
    now = now_iso()
    item = {
        "PK": f"FACILITYTYPE#{type_id}",
        "SK": "FACILITYTYPE",
        "gsi1pk": "FACILITYTYPE",
        "gsi1sk": now,
        "typeId": type_id,
        "name": sanitize_string(body["name"]),
        "description": sanitize_string(body.get("description", "")),
        "isBookable": bool(body.get("isBookable", True)),
        "createdAt": now,
        "updatedAt": now,
    }
    get_table().put_item(Item=item)
    return response.created(_item_to_type(item))


def update_facility_type(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    _, path = get_method_and_path(event)
    type_id = _extract_type_id(path)
    if not type_id:
        return response.bad_request("typeId is required")
    body = parse_body(event)
    now = now_iso()

    update_expr = "SET updatedAt = :now"
    expr_names = {}
    expr_values = {":now": now}
    if "name" in body:
        update_expr += ", #n = :name"
        expr_names["#n"] = "name"
        expr_values[":name"] = sanitize_string(body["name"])
    if "description" in body:
        update_expr += ", description = :desc"
        expr_values[":desc"] = sanitize_string(body.get("description", ""))
    if "isBookable" in body:
        update_expr += ", isBookable = :bookable"
        expr_values[":bookable"] = bool(body["isBookable"])

    kwargs = {
        "Key": {"PK": f"FACILITYTYPE#{type_id}", "SK": "FACILITYTYPE"},
        "UpdateExpression": update_expr,
        "ExpressionAttributeValues": expr_values,
        "ReturnValues": "ALL_NEW",
    }
    if expr_names:
        kwargs["ExpressionAttributeNames"] = expr_names

    resp = get_table().update_item(**kwargs)
    return response.ok(_item_to_type(resp.get("Attributes", {})))


def delete_facility_type(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    _, path = get_method_and_path(event)
    type_id = _extract_type_id(path)
    if not type_id:
        return response.bad_request("typeId is required")
    get_table().delete_item(Key={"PK": f"FACILITYTYPE#{type_id}", "SK": "FACILITYTYPE"})
    return response.no_content()


# ---------- Router ----------

router = Router()
router.add("GET",    r"/facility-types",        list_facility_types)
router.add("POST",   r"/facility-types",        create_facility_type)
router.add("PUT",    r"/facility-types/[^/]+",  update_facility_type)
router.add("DELETE", r"/facility-types/[^/]+",  delete_facility_type)


def lambda_handler(event: dict, context) -> dict:
    return router.dispatch(event)
