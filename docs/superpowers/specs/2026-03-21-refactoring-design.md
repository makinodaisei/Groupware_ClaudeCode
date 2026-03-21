# Refactoring Design: Backend Common Layer + Frontend API Layer

**Date:** 2026-03-21
**Scope:** Full-stack refactoring — backend Lambda handlers + frontend API layer
**Goals:** Eliminate code duplication, fix latent bugs, improve testability and maintainability

---

## 1. Background & Motivation

The codebase has four backend Lambda handlers (`facilities`, `schedules`, `documents`, `users`) and a React frontend. Both layers have accumulated duplication and bugs:

- Four handlers each define identical `_get_method_and_path()` and `_now_iso()` helpers
- `list_facilities` and `list_folders` each contain a dead `table.query()` call that wastes a DynamoDB round-trip before being overwritten by `table.scan()`
- The frontend's `lib/api.js` exposes only a generic `api(method, path, body)` function; pages embed raw path strings and HTTP verbs inline, making refactoring and typo detection difficult
- `todayLocalStr()` and `todayApiStr()` are duplicated in `Schedule.jsx` and `Facility.jsx`
- `Facility.jsx` checks `res.error` on the API response, but the API signals errors via HTTP status codes, not a body `error` field — this check never fires

---

## 2. Backend Design

### 2.1 Approach

Keep the four Lambda functions as separate SAM deployments (Lambda structure unchanged). Extend the existing `layers/common/python/` layer with two new modules that absorb all duplicated code.

`DocumentsFunction` handles both HTTP and S3 events, so a monolithic merge would complicate event routing with no practical benefit.

### 2.2 New Files in `layers/common/python/`

#### `utils.py`
Absorbs helpers duplicated across all four handlers:

```python
def now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""

def get_method_and_path(event: dict) -> tuple[str, str]:
    """Extract HTTP method and path from Lambda event requestContext."""
```

#### `router.py`
Provides a lightweight route dispatcher to separate routing from business logic:

```python
class Router:
    def add(self, method: str, pattern: str, handler: Callable) -> None: ...
    def dispatch(self, event: dict) -> dict: ...
```

- Matches `(method, path)` against registered regex patterns in order
- Returns `response.not_found("Endpoint")` if no route matches
- Wraps dispatch in a try/except to return `response.server_error()` on unhandled exceptions

### 2.3 Changes to Each Handler

Each of the four `handler.py` files:

1. **Remove** local `_get_method_and_path` and `_now_iso` definitions
2. **Import** `from utils import now_iso, get_method_and_path` and `from router import Router`
3. **Replace** the manual `lambda_handler` routing block with a `Router` instance
4. **Fix bugs:**
   - `facilities/handler.py` `list_facilities`: remove the dead `table.query()` call before `table.scan()`
   - `documents/handler.py` `list_folders`: same fix

No business logic changes. No SAM template changes.

### 2.4 Bug Fixes

| File | Function | Bug | Fix |
|------|----------|-----|-----|
| `facilities/handler.py` | `list_facilities` | Dead `table.query(PK.begins_with(...))` before `table.scan()` — DynamoDB does not support `begins_with` on partition keys; this call would error or return nothing and is immediately discarded | Remove the dead query call |
| `documents/handler.py` | `list_folders` | Same pattern: dead `table.query()` before `table.scan()` | Remove the dead query call |

---

## 3. Frontend Design

### 3.1 Approach

Replace the single `lib/api.js` with a domain-specific API module tree. Pages import named functions instead of embedding path strings.

### 3.2 New File Structure

```
frontend/src/lib/
  api/
    client.js        ← existing api() generic function (moved from lib/api.js)
    schedules.js     ← getSchedules(params), createSchedule(data), updateSchedule(id, data), deleteSchedule(id)
    facilities.js    ← getFacilities(), getReservations(facilityId, date), createReservation(facilityId, data), deleteReservation(facilityId, reservationId)
    documents.js     ← getFolders(parentId), createFolder(data), deleteFolder(folderId), getFiles(folderId), getUploadUrl(folderId, data), getDownloadUrl(folderId, fileId), deleteFile(folderId, fileId)
    users.js         ← getUsers(params), getUser(userId), createUser(data), updateUser(userId, data), deleteUser(userId)
    index.js         ← re-exports all named functions + setAuthToken, clearAuthToken, setUnauthorizedHandler
```

`lib/api.js` is removed; all imports updated to `'../lib/api'` (pointing to `index.js` via the directory).

### 3.3 `helpers.js` Additions

Add two date utility functions to eliminate duplication between `Schedule.jsx` and `Facility.jsx`:

```js
export function todayLocalStr(): string  // 'YYYY/MM/DD' for date inputs
export function todayApiStr(): string    // 'YYYY-MM-DD' for API query params
```

Remove the inline definitions from both pages.

### 3.4 Bug Fix

| File | Issue | Fix |
|------|-------|-----|
| `Facility.jsx` `handleSubmit` | `if (res.error === 'CONFLICT')` — the API returns HTTP 409 status; `res.error` is never set in the response body | Remove the `res.error` check. The generic `api()` client already rejects on non-2xx status; catch the rejection and map HTTP 409 to the conflict message |

### 3.5 Page Changes

Each page replaces inline `api(method, path)` calls with the corresponding named functions from `lib/api`. No UI changes. No component splits (out of scope for this refactoring).

---

## 4. Testing

- Backend: existing tests in `functions/facilities/tests/` and `functions/schedules/tests/` continue to pass without modification (behavior unchanged)
- New `utils.py` and `router.py` are pure functions — unit-testable without mocks
- Frontend: no test suite currently exists; the API layer extraction improves testability for future tests (each domain module can be mocked independently)

---

## 5. Out of Scope

- Component splitting in the frontend (e.g., extracting sub-components from `Schedule.jsx`)
- Custom React hooks (`useSchedule`, `useFacility`, etc.)
- SAM infrastructure changes
- New features or behavior changes
