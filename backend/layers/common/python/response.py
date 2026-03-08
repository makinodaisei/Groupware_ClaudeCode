"""Standard Lambda response builder for all Groupware handlers."""
import json
from typing import Any

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Amz-Date,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


def _build(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def ok(data: Any) -> dict:
    return _build(200, data)


def created(data: Any) -> dict:
    return _build(201, data)


def no_content() -> dict:
    return {
        "statusCode": 204,
        "headers": CORS_HEADERS,
        "body": "",
    }


def bad_request(message: str, details: Any = None) -> dict:
    body = {"error": "BAD_REQUEST", "message": message}
    if details:
        body["details"] = details
    return _build(400, body)


def unauthorized(message: str = "Unauthorized") -> dict:
    return _build(401, {"error": "UNAUTHORIZED", "message": message})


def forbidden(message: str = "Forbidden") -> dict:
    return _build(403, {"error": "FORBIDDEN", "message": message})


def not_found(resource: str = "Resource") -> dict:
    return _build(404, {"error": "NOT_FOUND", "message": f"{resource} not found"})


def conflict(message: str) -> dict:
    return _build(409, {"error": "CONFLICT", "message": message})


def server_error(message: str = "Internal server error") -> dict:
    return _build(500, {"error": "INTERNAL_SERVER_ERROR", "message": message})
