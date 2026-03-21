"""JWT claim extraction helpers for Cognito-authenticated API Gateway events."""
from typing import Optional
import response


def _get_claims(event: dict) -> dict:
    """Extract JWT claims from API Gateway HTTP API event context."""
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )


def get_user_id(event: dict) -> str:
    """Return Cognito sub (user ID) from the JWT claims."""
    return _get_claims(event).get("sub", "")


def get_email(event: dict) -> str:
    """Return email from JWT claims."""
    return _get_claims(event).get("email", "")


def get_groups(event: dict) -> list[str]:
    """Return list of Cognito groups the user belongs to."""
    groups_str = _get_claims(event).get("cognito:groups", "")
    if not groups_str:
        return []
    if isinstance(groups_str, list):
        return groups_str
    return [g.strip() for g in groups_str.strip("[]").split(",") if g.strip()]


def is_admin(event: dict) -> bool:
    """Return True if user is in the admin Cognito group."""
    return "admin" in get_groups(event)


def require_admin(event: dict) -> Optional[dict]:
    """Return 403 response if user is not admin, else None."""
    if not is_admin(event):
        return response.forbidden("Admin access required")
    return None


def is_editor(event: dict) -> bool:
    """Return True if user is in the editor Cognito group."""
    return "editor" in get_groups(event)


def require_editor_or_above(event: dict) -> Optional[dict]:
    """Return 403 response if user is neither admin nor editor, else None."""
    if not is_admin(event) and not is_editor(event):
        return response.forbidden("Editor or admin access required")
    return None
