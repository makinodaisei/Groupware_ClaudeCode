"""Shared utilities for all Groupware Lambda handlers."""
from datetime import datetime, timezone


def now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def get_method_and_path(event: dict) -> tuple[str, str]:
    """Extract HTTP method and path from Lambda event requestContext."""
    ctx = event.get("requestContext", {}).get("http", {})
    return ctx.get("method", ""), ctx.get("path", "")
