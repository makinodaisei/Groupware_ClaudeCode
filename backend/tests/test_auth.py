"""Tests for auth.py helpers."""
import os
import sys
import pytest

# パスを絶対パスで解決する（どのディレクトリから pytest を実行しても動作する）
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "layers", "common", "python"))

import auth


def _make_event(groups: list[str]) -> dict:
    groups_str = ", ".join(groups) if groups else ""
    return {
        "requestContext": {
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": "user-123",
                        "email": "test@example.com",
                        "cognito:groups": groups_str,
                    }
                }
            }
        }
    }


def test_is_admin_true():
    event = _make_event(["admin"])
    assert auth.is_admin(event) is True


def test_is_admin_false():
    event = _make_event(["user"])
    assert auth.is_admin(event) is False


def test_is_editor_true():
    event = _make_event(["editor"])
    assert auth.is_editor(event) is True


def test_is_editor_false_for_user():
    event = _make_event(["user"])
    assert auth.is_editor(event) is False


def test_is_editor_false_for_admin():
    """admin is not editor (separate role check)."""
    event = _make_event(["admin"])
    assert auth.is_editor(event) is False


def test_require_editor_or_above_allows_admin():
    event = _make_event(["admin"])
    assert auth.require_editor_or_above(event) is None


def test_require_editor_or_above_allows_editor():
    event = _make_event(["editor"])
    assert auth.require_editor_or_above(event) is None


def test_require_editor_or_above_blocks_user():
    event = _make_event(["user"])
    result = auth.require_editor_or_above(event)
    assert result is not None
    assert result["statusCode"] == 403
