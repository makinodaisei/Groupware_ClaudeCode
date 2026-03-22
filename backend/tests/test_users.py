"""Tests for users/handler.py."""
import json
import os
import sys
import pytest

import boto3
from moto import mock_aws

# パスを絶対パスで解決する
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_COMMON_PATH = os.path.join(_REPO_ROOT, "layers", "common", "python")
_USERS_PATH = os.path.join(_REPO_ROOT, "functions", "users")
sys.path.insert(0, _COMMON_PATH)
sys.path.insert(0, _USERS_PATH)


def _make_admin_event(method: str, path: str, body: dict = None, sub: str = "admin-sub") -> dict:
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": sub,
                        "email": "admin@example.com",
                        "cognito:groups": "admin",
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": None,
    }


@mock_aws
def test_create_user_with_editor_role():
    """editor ロールでユーザーを作成できる"""
    os.environ["AWS_REGION"] = "us-east-1"
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(
        PoolName="test-pool",
        Schema=[{"Name": "role", "AttributeDataType": "String", "Mutable": True}],
    )
    pool_id = pool["UserPool"]["Id"]
    os.environ["USER_POOL_ID"] = pool_id
    # editor グループを事前に作成しておく（admin_add_user_to_group に必要）
    for group in ("admin", "editor", "user"):
        cognito.create_group(GroupName=group, UserPoolId=pool_id)

    import importlib
    sys.path.insert(0, _USERS_PATH)
    import handler
    importlib.reload(handler)

    event = _make_admin_event("POST", "/users", {"email": "editor@example.com", "name": "Editor User", "role": "editor"})
    result = handler.create_user(event)
    assert result["statusCode"] == 201
    body = json.loads(result["body"])
    assert body["role"] == "editor"


@mock_aws
def test_create_user_rejects_invalid_role():
    """不正なロールは 400 を返す"""
    os.environ["AWS_REGION"] = "us-east-1"
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(
        PoolName="test-pool",
        Schema=[{"Name": "role", "AttributeDataType": "String", "Mutable": True}],
    )
    os.environ["USER_POOL_ID"] = pool["UserPool"]["Id"]

    import importlib
    sys.path.insert(0, _USERS_PATH)
    import handler
    importlib.reload(handler)

    event = _make_admin_event("POST", "/users", {"email": "x@example.com", "name": "X", "role": "superadmin"})
    result = handler.create_user(event)
    assert result["statusCode"] == 400


@mock_aws
def test_update_user_role_to_editor():
    """admin が user を editor に変更できる"""
    os.environ["AWS_REGION"] = "us-east-1"
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(PoolName="test-pool", Schema=[{"Name": "role", "AttributeDataType": "String", "Mutable": True}])
    pool_id = pool["UserPool"]["Id"]
    os.environ["USER_POOL_ID"] = pool_id
    cognito.admin_create_user(UserPoolId=pool_id, Username="target@example.com", UserAttributes=[{"Name": "custom:role", "Value": "user"}])
    cognito.create_group(GroupName="editor", UserPoolId=pool_id)
    cognito.create_group(GroupName="user", UserPoolId=pool_id)
    cognito.admin_add_user_to_group(UserPoolId=pool_id, Username="target@example.com", GroupName="user")

    import importlib
    sys.path.insert(0, _USERS_PATH)
    import handler
    importlib.reload(handler)

    event = _make_admin_event("PUT", "/users/target@example.com", {"role": "editor"})
    result = handler.update_user(event)
    assert result["statusCode"] == 200


@mock_aws
def test_update_user_enable_disable():
    """admin が ユーザーを無効化・有効化できる"""
    os.environ["AWS_REGION"] = "us-east-1"
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(PoolName="test-pool")
    pool_id = pool["UserPool"]["Id"]
    os.environ["USER_POOL_ID"] = pool_id
    cognito.admin_create_user(UserPoolId=pool_id, Username="target@example.com")

    import importlib
    sys.path.insert(0, _USERS_PATH)
    import handler
    importlib.reload(handler)

    # 無効化
    event = _make_admin_event("PUT", "/users/target@example.com", {"enabled": False})
    result = handler.update_user(event)
    assert result["statusCode"] == 200

    # 有効化
    event = _make_admin_event("PUT", "/users/target@example.com", {"enabled": True})
    result = handler.update_user(event)
    assert result["statusCode"] == 200
