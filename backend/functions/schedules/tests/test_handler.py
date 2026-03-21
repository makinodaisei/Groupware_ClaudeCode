"""Unit tests for schedules handler."""
import json
import os
import sys
import pytest

os.environ.setdefault("TABLE_NAME", "groupware-test")
os.environ.setdefault("BUCKET_NAME", "test-bucket")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")

# Set up sys.path and import handler at module level with a unique name to avoid
# collision with facilities/handler.py when both test modules are collected together.
sys.path.insert(0, "backend/layers/common/python")
sys.path.insert(0, "backend/functions/schedules")
sys.modules.pop("handler", None)

import boto3
from moto import mock_aws
from handler import lambda_handler


def _make_event(method: str, path: str, body=None, query_params=None, user_id="user-123", groups=None) -> dict:
    groups = groups or ["user"]
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": user_id,
                        "email": "test@example.com",
                        "cognito:groups": groups,
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": query_params,
    }


@pytest.fixture(autouse=True)
def aws_mock():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        dynamodb.create_table(
            TableName="groupware-test",
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "gsi1pk", "AttributeType": "S"},
                {"AttributeName": "gsi1sk", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "DateRangeIndex",
                    "KeySchema": [
                        {"AttributeName": "gsi1pk", "KeyType": "HASH"},
                        {"AttributeName": "gsi1sk", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )
        import db_client
        db_client._table = None
        yield


def test_create_schedule_success():
    event = _make_event(
        "POST", "/schedules",
        body={
            "title": "Weekly Sync",
            "startDatetime": "2026-03-09T10:00:00+09:00",
            "endDatetime": "2026-03-09T11:00:00+09:00",
            "isPublic": True,
        }
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 201
    data = json.loads(result["body"])
    assert data["title"] == "Weekly Sync"
    assert "eventId" in data


def test_create_schedule_missing_fields():
    event = _make_event("POST", "/schedules", body={"title": "Incomplete"})
    result = lambda_handler(event, None)
    assert result["statusCode"] == 400


def test_create_schedule_invalid_datetime():
    event = _make_event(
        "POST", "/schedules",
        body={
            "title": "Bad Dates",
            "startDatetime": "not-a-date",
            "endDatetime": "also-not-a-date",
        }
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 400


def test_list_schedules_monthly():
    # First create a schedule
    create_event = _make_event(
        "POST", "/schedules",
        body={
            "title": "March Meeting",
            "startDatetime": "2026-03-15T10:00:00+09:00",
            "endDatetime": "2026-03-15T11:00:00+09:00",
        }
    )
    lambda_handler(create_event, None)

    # Then list by month
    list_event = _make_event(
        "GET", "/schedules",
        query_params={"month": "2026-03"}
    )
    result = lambda_handler(list_event, None)
    assert result["statusCode"] == 200
    data = json.loads(result["body"])
    assert "events" in data


def test_options_returns_200():
    event = _make_event("OPTIONS", "/schedules")
    result = lambda_handler(event, None)
    assert result["statusCode"] == 200
