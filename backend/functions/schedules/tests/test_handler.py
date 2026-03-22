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


def _create(title: str, start: str, end: str, is_public=True, user_id="user-123") -> dict:
    result = lambda_handler(
        _make_event("POST", "/schedules", body={
            "title": title,
            "startDatetime": start,
            "endDatetime": end,
            "isPublic": is_public,
        }, user_id=user_id),
        None
    )
    assert result["statusCode"] == 201
    return json.loads(result["body"])


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


def test_weekly_view_month_boundary():
    """⑧ Events starting in March must appear when querying a week that spans March/April."""
    # Event starts March 30, ends April 2
    _create(
        "Cross-month event",
        "2026-03-30T09:00:00+09:00",
        "2026-04-02T18:00:00+09:00",
    )
    # Event starts April 1 (purely April)
    _create(
        "April kickoff",
        "2026-04-01T10:00:00+09:00",
        "2026-04-01T11:00:00+09:00",
    )

    # Query the week 2026-03-28 to 2026-04-03
    result = lambda_handler(
        _make_event("GET", "/schedules", query_params={
            "start": "2026-03-28T00:00:00+09:00",
            "end":   "2026-04-03T23:59:59+09:00",
        }),
        None
    )
    assert result["statusCode"] == 200
    data = json.loads(result["body"])
    titles = {e["title"] for e in data["events"]}
    assert "Cross-month event" in titles, "March-starting event missing from cross-month week query"
    assert "April kickoff" in titles, "April event missing from cross-month week query"


def test_monthly_view_includes_prev_month_overflow():
    """⑨ An event starting in March but ending in April must appear in the April month view."""
    _create(
        "Long conference",
        "2026-03-29T09:00:00+09:00",
        "2026-04-03T18:00:00+09:00",
    )

    result = lambda_handler(
        _make_event("GET", "/schedules", query_params={"month": "2026-04"}),
        None
    )
    assert result["statusCode"] == 200
    data = json.loads(result["body"])
    titles = {e["title"] for e in data["events"]}
    assert "Long conference" in titles, "March-started event that extends into April missing from April view"


def test_update_is_public_changes_visibility():
    """⑩ Changing isPublic from True to False must make the event inaccessible to other users."""
    created = _create(
        "Team outing",
        "2026-05-01T10:00:00+09:00",
        "2026-05-01T18:00:00+09:00",
        is_public=True,
        user_id="owner-user",
    )
    event_id = created["eventId"]

    # Another user can see it while public
    get_result = lambda_handler(
        _make_event("GET", f"/schedules/{event_id}", user_id="other-user"),
        None
    )
    assert get_result["statusCode"] == 200

    # Owner flips isPublic to False
    update_result = lambda_handler(
        _make_event("PUT", f"/schedules/{event_id}",
                    body={"isPublic": False}, user_id="owner-user"),
        None
    )
    assert update_result["statusCode"] == 200

    # Other user must no longer see it
    get_after = lambda_handler(
        _make_event("GET", f"/schedules/{event_id}", user_id="other-user"),
        None
    )
    assert get_after["statusCode"] in (403, 404), (
        f"Expected 403 or 404 after making event private, got {get_after['statusCode']}"
    )


def test_options_returns_200():
    event = _make_event("OPTIONS", "/schedules")
    result = lambda_handler(event, None)
    assert result["statusCode"] == 200
