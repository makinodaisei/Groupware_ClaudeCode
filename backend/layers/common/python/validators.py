"""Shared validation utilities."""
import json
import re
from datetime import datetime
from typing import Any


def parse_body(event: dict) -> dict:
    """Parse JSON body from Lambda event. Returns empty dict if no body."""
    body = event.get("body") or "{}"
    if isinstance(body, str):
        return json.loads(body)
    return body


def require_fields(data: dict, fields: list[str]) -> list[str]:
    """Return list of missing required field names."""
    return [f for f in fields if not data.get(f)]


def is_valid_iso_datetime(value: str) -> bool:
    """Validate ISO-8601 datetime string."""
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except (ValueError, AttributeError):
        return False


def is_valid_date(value: str) -> bool:
    """Validate YYYY-MM-DD date string."""
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}$", value or ""))


def sanitize_string(value: Any, max_length: int = 1000) -> str:
    """Strip and truncate a string value."""
    if not isinstance(value, str):
        return str(value)
    return value.strip()[:max_length]
