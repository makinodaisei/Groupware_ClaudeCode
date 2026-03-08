"""Domain exception classes."""


class GroupwareError(Exception):
    """Base exception for Groupware domain errors."""


class NotFoundError(GroupwareError):
    def __init__(self, resource: str = "Resource"):
        self.resource = resource
        super().__init__(f"{resource} not found")


class ConflictError(GroupwareError):
    def __init__(self, message: str = "Resource conflict"):
        super().__init__(message)


class ValidationError(GroupwareError):
    def __init__(self, message: str, details=None):
        self.details = details
        super().__init__(message)


class ForbiddenError(GroupwareError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message)
