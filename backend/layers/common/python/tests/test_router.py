import sys
sys.path.insert(0, "backend/layers/common/python")


def _make_event(method: str, path: str) -> dict:
    return {"requestContext": {"http": {"method": method, "path": path}}}


def test_options_returns_200():
    from router import Router
    r = Router()
    result = r.dispatch(_make_event("OPTIONS", "/facilities"))
    assert result["statusCode"] == 200


def test_matching_route_calls_handler():
    from router import Router
    called_with = []

    def my_handler(event):
        called_with.append(event)
        return {"statusCode": 200, "body": "ok"}

    r = Router()
    r.add("GET", r".*/facilities$", my_handler)
    result = r.dispatch(_make_event("GET", "/facilities"))
    assert result["statusCode"] == 200
    assert len(called_with) == 1


def test_no_matching_route_returns_404():
    from router import Router
    r = Router()
    result = r.dispatch(_make_event("GET", "/unknown"))
    assert result["statusCode"] == 404


def test_method_mismatch_returns_404():
    from router import Router
    r = Router()
    r.add("POST", r".*/facilities$", lambda e: {"statusCode": 200})
    result = r.dispatch(_make_event("GET", "/facilities"))
    assert result["statusCode"] == 404


def test_unhandled_exception_returns_500():
    from router import Router

    def bad_handler(event):
        raise ValueError("boom")

    r = Router()
    r.add("GET", r".*/boom$", bad_handler)
    result = r.dispatch(_make_event("GET", "/boom"))
    assert result["statusCode"] == 500


def test_first_matching_route_wins():
    from router import Router
    results = []

    def handler_a(event):
        results.append("a")
        return {"statusCode": 200}

    def handler_b(event):
        results.append("b")
        return {"statusCode": 200}

    r = Router()
    r.add("GET", r".*/items$", handler_a)
    r.add("GET", r".*/items$", handler_b)
    r.dispatch(_make_event("GET", "/items"))
    assert results == ["a"]
