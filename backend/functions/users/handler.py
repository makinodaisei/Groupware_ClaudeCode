"""User management Lambda handler - routes to Cognito Admin API."""
import json
import logging
import os
import re

import auth
import response
from db_client import get_cognito_client
from utils import get_method_and_path
from router import Router
from validators import parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

USER_POOL_ID = os.environ.get("USER_POOL_ID", "")

VALID_ROLES = ("admin", "editor", "user")


# ---------- Helpers ----------

def _extract_user_id(path: str) -> str | None:
    match = re.search(r"/users/([^/]+)$", path)
    return match.group(1) if match else None


def _extract_user_from_cognito(user: dict) -> dict:
    attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
    return {
        "userId": user.get("Username"),
        "email": attrs.get("email", ""),
        "name": attrs.get("name", ""),
        "role": attrs.get("custom:role", "user"),
        "status": user.get("UserStatus"),
        "enabled": user.get("Enabled", True),
        "createdAt": str(user.get("UserCreateDate", "")),
    }


# ---------- Route Handlers ----------

def list_users(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    cognito = get_cognito_client()
    params = event.get("queryStringParameters") or {}
    kwargs = {"UserPoolId": USER_POOL_ID, "Limit": int(params.get("limit", 60))}
    if params.get("token"):
        kwargs["PaginationToken"] = params["token"]

    resp = cognito.list_users(**kwargs)
    users = [_extract_user_from_cognito(u) for u in resp.get("Users", [])]
    return response.ok({
        "users": users,
        "nextToken": resp.get("PaginationToken"),
    })


def get_user(event: dict) -> dict:
    caller_id = auth.get_user_id(event)
    _, path = get_method_and_path(event)
    target_id = _extract_user_id(path)

    # Admin can get any user; regular user can only get themselves
    if not auth.is_admin(event) and caller_id != target_id:
        return response.forbidden()

    cognito = get_cognito_client()
    try:
        resp = cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=target_id)
        attrs = {a["Name"]: a["Value"] for a in resp.get("UserAttributes", [])}
        return response.ok({
            "userId": resp["Username"],
            "email": attrs.get("email", ""),
            "name": attrs.get("name", ""),
            "role": attrs.get("custom:role", "user"),
            "status": resp.get("UserStatus"),
            "enabled": resp.get("Enabled", True),
            "createdAt": str(resp.get("UserCreateDate", "")),
        })
    except cognito.exceptions.UserNotFoundException:
        return response.not_found("User")


def create_user(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    body = parse_body(event)
    missing = require_fields(body, ["email", "name"])
    if missing:
        return response.bad_request(f"Missing required fields: {', '.join(missing)}")

    email = sanitize_string(body["email"])
    name = sanitize_string(body["name"])
    role = body.get("role", "user")
    if role not in VALID_ROLES:
        return response.bad_request(f"role must be one of: {', '.join(VALID_ROLES)}")

    cognito = get_cognito_client()
    try:
        resp = cognito.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": name},
                {"Name": "custom:role", "Value": role},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
        group = role  # admin, editor, user それぞれ同名グループ
        cognito.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=email,
            GroupName=group,
        )
        user = _extract_user_from_cognito(resp["User"])
        return response.created(user)
    except cognito.exceptions.UsernameExistsException:
        return response.conflict("User with this email already exists")


def update_user(event: dict) -> dict:
    _, path = get_method_and_path(event)
    target_id = _extract_user_id(path)
    caller_id = auth.get_user_id(event)

    if not auth.is_admin(event) and caller_id != target_id:
        return response.forbidden()

    body = parse_body(event)
    cognito = get_cognito_client()
    attrs = []

    if "name" in body:
        attrs.append({"Name": "name", "Value": sanitize_string(body["name"])})

    if "role" in body:
        if not auth.is_admin(event):
            return response.forbidden("Only admins can change roles")
        role = body["role"]
        if role not in VALID_ROLES:
            return response.bad_request(f"role must be one of: {', '.join(VALID_ROLES)}")
        attrs.append({"Name": "custom:role", "Value": role})

        # Cognito グループのメンバーシップを同期する
        for old_group in VALID_ROLES:
            try:
                cognito.admin_remove_user_from_group(
                    UserPoolId=USER_POOL_ID,
                    Username=target_id,
                    GroupName=old_group,
                )
            except Exception:
                pass  # グループ未所属の場合は無視
        cognito.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=target_id,
            GroupName=role,
        )

    if "enabled" in body:
        if not auth.is_admin(event):
            return response.forbidden("Only admins can enable/disable users")
        if body["enabled"]:
            cognito.admin_enable_user(UserPoolId=USER_POOL_ID, Username=target_id)
        else:
            cognito.admin_disable_user(UserPoolId=USER_POOL_ID, Username=target_id)

    if attrs:
        cognito.admin_update_user_attributes(
            UserPoolId=USER_POOL_ID,
            Username=target_id,
            UserAttributes=attrs,
        )

    return response.ok({"userId": target_id, "updated": True})


def delete_user(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    _, path = get_method_and_path(event)
    target_id = _extract_user_id(path)
    caller_id = auth.get_user_id(event)

    if caller_id == target_id:
        return response.bad_request("Cannot delete your own account")

    cognito = get_cognito_client()
    try:
        cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=target_id)
        return response.no_content()
    except cognito.exceptions.UserNotFoundException:
        return response.not_found("User")


# ---------- Router ----------

_router = Router()
_router.add("GET",    r".*/users$",          list_users)
_router.add("POST",   r".*/users$",          create_user)
_router.add("GET",    r".*/users/[^/]+$",    get_user)
_router.add("PUT",    r".*/users/[^/]+$",    update_user)
_router.add("DELETE", r".*/users/[^/]+$",    delete_user)


def lambda_handler(event: dict, context) -> dict:
    logger.info("Users event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
