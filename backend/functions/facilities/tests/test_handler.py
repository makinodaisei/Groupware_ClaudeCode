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


def test_overlapping_time_range_rejected():
    """A reservation whose time range overlaps an existing one must return 409,
    even when the start time is different (e.g. 10:00-12:00 vs 11:00-13:00)."""
    facility_id = _create_facility()

    # Book 10:00-12:00
    event1 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={
            "title": "Morning Block",
            "startDatetime": "2026-03-20T10:00:00+09:00",
            "endDatetime": "2026-03-20T12:00:00+09:00",
        }
    )
    assert lambda_handler(event1, None)["statusCode"] == 201

    # Try to book 11:00-13:00 (overlaps)
    event2 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={
            "title": "Overlapping Meeting",
            "startDatetime": "2026-03-20T11:00:00+09:00",
            "endDatetime": "2026-03-20T13:00:00+09:00",
        }
    )
    result2 = lambda_handler(event2, None)
    assert result2["statusCode"] == 409

    # Try to book 09:00-10:30 (overlaps at end)
    event3 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={
            "title": "Early Overlap",
            "startDatetime": "2026-03-20T09:00:00+09:00",
            "endDatetime": "2026-03-20T10:30:00+09:00",
        }
    )
    result3 = lambda_handler(event3, None)
    assert result3["statusCode"] == 409


def test_adjacent_reservations_allowed():
    """Reservations that touch but do not overlap must both succeed (end == next start)."""
    facility_id = _create_facility()

    event1 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={
            "title": "Morning",
            "startDatetime": "2026-03-21T09:00:00+09:00",
            "endDatetime": "2026-03-21T10:00:00+09:00",
        }
    )
    assert lambda_handler(event1, None)["statusCode"] == 201

    event2 = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={
            "title": "Afternoon",
            "startDatetime": "2026-03-21T10:00:00+09:00",
            "endDatetime": "2026-03-21T11:00:00+09:00",
        }
    )
    assert lambda_handler(event2, None)["statusCode"] == 201


def test_delete_reservation_removes_lock():
    """After deleting a reservation, the same timeslot can be booked again."""
    facility_id = _create_facility()
    body = {
        "title": "Temp Meeting",
        "startDatetime": "2026-03-22T15:00:00+09:00",
        "endDatetime": "2026-03-22T16:00:00+09:00",
    }

    create_result = lambda_handler(
        _make_event("POST", f"/facilities/{facility_id}/reservations", body=body, user_id="user-A"),
        None
    )
    assert create_result["statusCode"] == 201
    reservation_id = json.loads(create_result["body"])["reservationId"]

    # Delete it
    delete_result = lambda_handler(
        _make_event("DELETE", f"/facilities/{facility_id}/reservations/{reservation_id}", user_id="user-A"),
        None
    )
    assert delete_result["statusCode"] == 204

    # Rebook the same slot — must succeed
    rebook_result = lambda_handler(
        _make_event("POST", f"/facilities/{facility_id}/reservations", body=body, user_id="user-B"),
        None
    )
    assert rebook_result["statusCode"] == 201


def test_reservation_missing_fields():
    facility_id = _create_facility()
    event = _make_event(
        "POST", f"/facilities/{facility_id}/reservations",
        body={"title": "Incomplete"}
    )
    result = lambda_handler(event, None)
    assert result["statusCode"] == 400
