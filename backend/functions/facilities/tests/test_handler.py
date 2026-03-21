"""Unit tests for facilities handler - focus on exclusive control logic."""
import json
import os
import sys
import pytest

os.environ.setdefault("TABLE_NAME", "groupware-test")
os.environ.setdefault("BUCKET_NAME", "test-bucket")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")

# Set up sys.path and import handler at module level.
sys.path.insert(0, "backend/layers/common/python")
sys.path.insert(0, "backend/functions/facilities")

import boto3
from moto import mock_aws
from handler import lambda_handler


def _make_event(method: str, path: str, body=None, query_params=None,
                user_id="user-123", groups=None) -> dict:
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
                {"AttributeName": "gsi2pk", "AttributeType": "S"},
                {"AttributeName": "gsi2sk", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "ReservationByDateIndex",
                    "KeySchema": [
                        {"AttributeName": "gsi2pk", "KeyType": "HASH"},
                        {"AttributeName": "gsi2sk", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )
        import db_client
        db_client._table = None
        yield


def _create_facility() -> str:
    """Helper: create a facility as admin and return its ID."""
    event = _make_event(
        "POST", "/facilities",
        body={"name": "Conference Room A", "capacity": 10},
        groups=["admin"]
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 201
    return json.loads(result["body"])["facilityId"]


def test_create_facility_admin_only():
    # Non-admin should be rejected
    event = _make_event(
        "POST", "/facilities",
        body={"name": "Room B"},
        groups=["user"]
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 403


def test_create_reservation_success():
    facility_id = _create_facility()

    event = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={
            "title": "Sprint Planning",
            "startDatetime": "2026-03-10T10:00:00+09:00",
            "endDatetime": "2026-03-10T11:00:00+09:00",
        }
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 201
    data = json.loads(result["body"])
    assert data["title"] == "Sprint Planning"
    assert data["facilityId"] == facility_id


def test_duplicate_reservation_rejected():
    """The same timeslot on the same facility must return 409."""
    facility_id = _create_facility()
    reservation_body = {
        "title": "First Meeting",
        "startDatetime": "2026-03-11T14:00:00+09:00",
        "endDatetime": "2026-03-11T15:00:00+09:00",
    }

    # First reservation should succeed
    event1 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body=reservation_body, user_id="user-001"
    )
    result1 = lambda_handler(event1, None)
    assert result1["statusCode"] == 201

    # Second reservation at the same timeslot must be rejected
    reservation_body["title"] = "Conflicting Meeting"
    event2 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body=reservation_body, user_id="user-002"
    )
    result2 = lambda_handler(event2, None)
    assert result2["statusCode"] == 409
    data = json.loads(result2["body"])
    assert data["error"] == "CONFLICT"


def test_reservation_missing_fields():
    facility_id = _create_facility()
    event = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={"title": "Incomplete"}
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 400
