import sys
sys.path.insert(0, "backend/layers/common/python")


def test_now_iso_returns_utc_iso_string():
    from utils import now_iso
    result = now_iso()
    # Should parse as ISO datetime without raising
    from datetime import datetime
    dt = datetime.fromisoformat(result)
    assert dt.tzinfo is not None  # timezone-aware


def test_get_method_and_path_extracts_correctly():
    from utils import get_method_and_path
    event = {
        "requestContext": {
            "http": {
                "method": "POST",
                "path": "/facilities/abc/reservations",
            }
        }
    }
    method, path = get_method_and_path(event)
    assert method == "POST"
    assert path == "/facilities/abc/reservations"


def test_get_method_and_path_handles_missing_context():
    from utils import get_method_and_path
    method, path = get_method_and_path({})
    assert method == ""
    assert path == ""
