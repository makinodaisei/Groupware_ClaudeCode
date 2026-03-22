"""Organization master Lambda handler."""
import logging
import re
import uuid

import auth
import response
from boto3.dynamodb.conditions import Key
from db_client import get_table
from router import Router
from utils import get_method_and_path, now_iso
from validators import parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _extract_org_id(path: str) -> str | None:
    match = re.search(r"/orgs/([^/]+)$", path)
    return match.group(1) if match else None


def _item_to_org(item: dict) -> dict:
    return {
        "orgId": item.get("orgId"),
        "name": item.get("name"),
        "description": item.get("description", ""),
        "parentOrgId": item.get("parentOrgId", ""),
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
    }


def list_orgs(event: dict) -> dict:
    # All authenticated users can list orgs (org view needs this)
    table = get_table()
    resp = table.query(
        IndexName="DateRangeIndex",
        KeyConditionExpression=Key("gsi1pk").eq("ORG"),
    )
    orgs = [_item_to_org(i) for i in resp.get("Items", [])]
    return response.ok({"orgs": orgs})


def create_org(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    body = parse_body(event)
    err = require_fields(body, ["name"])
    if err:
        return err

    org_id = str(uuid.uuid4())
    now = now_iso()
    item = {
        "PK": f"ORG#{org_id}",
        "SK": "ORG",
        "gsi1pk": "ORG",
        "gsi1sk": now,
        "orgId": org_id,
        "name": sanitize_string(body["name"]),
        "description": sanitize_string(body.get("description", "")),
        "parentOrgId": body.get("parentOrgId", ""),
        "createdAt": now,
        "updatedAt": now,
    }
    get_table().put_item(Item=item)
    return response.created(_item_to_org(item))


def get_org(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    _, path = get_method_and_path(event)
    org_id = _extract_org_id(path)
    if not org_id:
        return response.bad_request("orgId is required")
    resp = get_table().get_item(Key={"PK": f"ORG#{org_id}", "SK": "ORG"})
    item = resp.get("Item")
    if not item:
        return response.not_found("Org")
    return response.ok(_item_to_org(item))


def update_org(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    _, path = get_method_and_path(event)
    org_id = _extract_org_id(path)
    if not org_id:
        return response.bad_request("orgId is required")
    body = parse_body(event)
    now = now_iso()

    update_expr = "SET updatedAt = :now"
    expr_values = {":now": now}
    if "name" in body:
        update_expr += ", #n = :name"
        expr_values[":name"] = sanitize_string(body["name"])
    if "description" in body:
        update_expr += ", description = :desc"
        expr_values[":desc"] = sanitize_string(body.get("description", ""))
    if "parentOrgId" in body:
        update_expr += ", parentOrgId = :parent"
        expr_values[":parent"] = body.get("parentOrgId", "")

    kwargs = {
        "Key": {"PK": f"ORG#{org_id}", "SK": "ORG"},
        "UpdateExpression": update_expr,
        "ExpressionAttributeValues": expr_values,
        "ReturnValues": "ALL_NEW",
    }
    if "name" in body:
        kwargs["ExpressionAttributeNames"] = {"#n": "name"}

    resp = get_table().update_item(**kwargs)
    return response.ok(_item_to_org(resp.get("Attributes", {})))


def delete_org(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    _, path = get_method_and_path(event)
    org_id = _extract_org_id(path)
    if not org_id:
        return response.bad_request("orgId is required")
    get_table().delete_item(Key={"PK": f"ORG#{org_id}", "SK": "ORG"})
    return response.no_content()


# ---------- Router ----------

router = Router()
router.add("GET",    r".*/orgs$",         list_orgs)
router.add("POST",   r".*/orgs$",         create_org)
router.add("GET",    r".*/orgs/[^/]+$",   get_org)
router.add("PUT",    r".*/orgs/[^/]+$",   update_org)
router.add("DELETE", r".*/orgs/[^/]+$",   delete_org)


def lambda_handler(event: dict, context) -> dict:
    return router.dispatch(event)
