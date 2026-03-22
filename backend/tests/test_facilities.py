"""Tests for facilities/handler.py."""
import json
import os
import sys
import pytest

import boto3
from moto import mock_aws

# パスを絶対パスで解決する
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_COMMON_PATH = os.path.join(_REPO_ROOT, "layers", "common", "python")
_FACILITIES_PATH = os.path.join(_REPO_ROOT, "functions", "facilities")
sys.path.insert(0, _COMMON_PATH)
sys.path.insert(0, _FACILITIES_PATH)

TABLE_NAME = "test-table"


def _make_admin_event(method: str, path: str, body: dict = None) -> dict:
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": "admin-sub",
                        "email": "admin@example.com",
                        "cognito:groups": "admin",
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": None,
    }


def _setup_table(dynamodb):
    return dynamodb.create_table(
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
def test_create_facility_with_parent_id():
    """parentId を指定して施設を作成できる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    sys.path.insert(0, _FACILITIES_PATH)
    import handler
    importlib.reload(handler)

    # まず親グループを作成
    event = _make_admin_event("POST", "/facilities", {
        "name": "本社ビル",
        "facilityType": "group",
    })
    result = handler.create_facility(event)
    assert result["statusCode"] == 201
    group = json.loads(result["body"])
    group_id = group["facilityId"]

    # 子施設を作成
    event = _make_admin_event("POST", "/facilities", {
        "name": "第1会議室",
        "facilityType": "facility",
        "parentId": group_id,
        "capacity": 10,
    })
    result = handler.create_facility(event)
    assert result["statusCode"] == 201
    body = json.loads(result["body"])
    assert body["parentId"] == group_id
    assert body["facilityType"] == "facility"


@mock_aws
def test_list_facilities_includes_hierarchy_fields():
    """GET /facilities レスポンスに parentId と facilityType が含まれる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    sys.path.insert(0, _FACILITIES_PATH)
    import handler
    importlib.reload(handler)

    event = _make_admin_event("POST", "/facilities", {"name": "会議室A"})
    handler.create_facility(event)

    event = _make_admin_event("GET", "/facilities")
    result = handler.list_facilities(event)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    facility = body["facilities"][0]
    assert "parentId" in facility
    assert "facilityType" in facility
    assert facility["parentId"] == "ROOT"
    assert facility["facilityType"] == "facility"


@mock_aws
def test_update_facility():
    """PUT /facilities/{id} で施設情報を更新できる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    sys.path.insert(0, _FACILITIES_PATH)
    import handler
    importlib.reload(handler)

    create_event = _make_admin_event("POST", "/facilities", {"name": "旧会議室名"})
    result = handler.create_facility(create_event)
    facility_id = json.loads(result["body"])["facilityId"]

    update_event = _make_admin_event("PUT", f"/facilities/{facility_id}", {"name": "新会議室名", "capacity": 20})
    result = handler.update_facility(update_event)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["name"] == "新会議室名"
    assert body["capacity"] == 20


@mock_aws
def test_delete_facility_blocks_if_has_children():
    """子施設が存在する親グループは削除不可（409）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    sys.path.insert(0, _FACILITIES_PATH)
    import handler
    importlib.reload(handler)

    # 親グループ作成
    group_event = _make_admin_event("POST", "/facilities", {"name": "グループ", "facilityType": "group"})
    group_id = json.loads(handler.create_facility(group_event)["body"])["facilityId"]

    # 子施設作成
    child_event = _make_admin_event("POST", "/facilities", {"name": "子施設", "parentId": group_id})
    handler.create_facility(child_event)

    # 親を削除しようとすると 409
    delete_event = _make_admin_event("DELETE", f"/facilities/{group_id}")
    result = handler.delete_facility(delete_event)
    assert result["statusCode"] == 409


@mock_aws
def test_delete_facility_success():
    """予約も子施設もない施設は削除できる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    sys.path.insert(0, _FACILITIES_PATH)
    import handler
    importlib.reload(handler)

    create_event = _make_admin_event("POST", "/facilities", {"name": "削除予定施設"})
    facility_id = json.loads(handler.create_facility(create_event)["body"])["facilityId"]

    delete_event = _make_admin_event("DELETE", f"/facilities/{facility_id}")
    result = handler.delete_facility(delete_event)
    assert result["statusCode"] == 204


@mock_aws
def test_delete_facility_blocks_if_has_reservations():
    """予約が存在する施設は削除不可（409）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["AWS_DEFAULT_REGION"] = "ap-northeast-1"
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    sys.path.insert(0, _FACILITIES_PATH)
    import handler
    importlib.reload(handler)

    # 施設を作成
    create_event = _make_admin_event("POST", "/facilities", {"name": "予約あり施設"})
    facility_id = json.loads(handler.create_facility(create_event)["body"])["facilityId"]

    # 予約を直接 DynamoDB に書き込む
    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item={
        "PK": f"FACILITY#{facility_id}",
        "SK": "RESERVATION#2026-03-21T10:00#dummy-id",
        "entityType": "RESERVATION",
        "reservationId": "dummy-id",
        "facilityId": facility_id,
    })

    # 削除しようとすると 409
    delete_event = _make_admin_event("DELETE", f"/facilities/{facility_id}")
    result = handler.delete_facility(delete_event)
    assert result["statusCode"] == 409
