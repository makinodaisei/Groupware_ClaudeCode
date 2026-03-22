"""Lightweight HTTP router for Lambda handlers."""
import logging
import re
from typing import Callable

import response
from utils import get_method_and_path

logger = logging.getLogger()


class Router:
    """Register routes and dispatch Lambda events to handler functions."""

    def __init__(self) -> None:
        self._routes: list[tuple[str, str, Callable]] = []

    def add(self, method: str, pattern: str, handler: Callable) -> None:
        """Register a route. `pattern` is a regex matched against the full path."""
        self._routes.append((method.upper(), pattern, handler))

    def dispatch(self, event: dict) -> dict:
        """Dispatch event to the first matching route handler.

        - OPTIONS requests return 200 (CORS preflight).
        - Unmatched requests return 404.
        - Unhandled exceptions return 500.
        """
        method, path = get_method_and_path(event)

        if method == "OPTIONS":
            return response.ok({})

        try:
            for route_method, pattern, handler in self._routes:
                if route_method == method and re.fullmatch(pattern, path):
                    return handler(event)
            return response.not_found("Endpoint")
        except Exception as e:
            logger.exception("Unhandled error in router dispatch")
            return response.server_error(str(e))
