"""Tests for documents/handler.py — editor role restriction."""
import json
import os
import sys

import boto3
from moto import mock_aws

# パスを絶対パスで解決する
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_COMMON_PATH = os.path.join(_REPO_ROOT, "layers", "common", "python")
_DOCUMENTS_PATH = os.path.join(_REPO_ROOT, "functions", "documents")
sys.path.insert(0, _COMMON_PATH)
sys.path.insert(0, _DOCUMENTS_PATH)

TABLE_NAME = "test-table"
BUCKET_NAME = "test-bucket"


def _make_event(method: str, path: str, body: dict = None, groups: str = "user", sub: str = "user-sub") -> dict:
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": sub,
                        "email": "user@example.com",
                        "cognito:groups": groups,
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": None,
    }


def _setup(dynamodb):
    dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@mock_aws
def test_create_folder_blocked_for_user():
    """user ロールはフォルダ作成不可（403）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["BUCKET_NAME"] = BUCKET_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup(dynamodb)

    import importlib
    sys.path.insert(0, _DOCUMENTS_PATH)
    import handler
    importlib.reload(handler)

    event = _make_event("POST", "/documents/folders", {"name": "新フォルダ"}, groups="user")
    result = handler.create_folder(event)
    assert result["statusCode"] == 403


@mock_aws
def test_create_folder_allowed_for_editor():
    """editor ロールはフォルダ作成可能（201）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["BUCKET_NAME"] = BUCKET_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup(dynamodb)

    import importlib
    sys.path.insert(0, _DOCUMENTS_PATH)
    import handler
    importlib.reload(handler)

    event = _make_event("POST", "/documents/folders", {"name": "新フォルダ"}, groups="editor")
    result = handler.create_folder(event)
    assert result["statusCode"] == 201


@mock_aws
def test_create_folder_allowed_for_admin():
    """admin ロールはフォルダ作成可能（201）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["BUCKET_NAME"] = BUCKET_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup(dynamodb)

    import importlib
    sys.path.insert(0, _DOCUMENTS_PATH)
    import handler
    importlib.reload(handler)

    event = _make_event("POST", "/documents/folders", {"name": "新フォルダ"}, groups="admin")
    result = handler.create_folder(event)
    assert result["statusCode"] == 201
