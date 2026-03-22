# Refactoring Design: Backend Common Layer + Frontend API Layer

**Date:** 2026-03-21
**Scope:** Full-stack refactoring — backend Lambda handlers + frontend API layer
**Goals:** Eliminate code duplication, fix latent bugs, improve testability and maintainability

---

## 1. Background & Motivation

The codebase has four backend Lambda handlers (`facilities`, `schedules`, `documents`, `users`) and a React frontend. Both layers have accumulated duplication and bugs:

- All four handlers define identical `_get_method_and_path()`. Three of them (`facilities`, `schedules`, `documents`) also define identical `_now_iso()`. `users/handler.py` does not use timestamps so it has no `_now_iso`.
- `list_facilities` and `list_folders` each contain a dead `table.query()` call that wastes a DynamoDB round-trip before being overwritten by `table.scan()`. Additionally, the `list_facilities` scan uses raw string `FilterExpression` syntax with `begins_with(PK, :prefix)` — `begins_with` is not valid in a FilterExpression (only in KeyConditionExpression); this call may fail at runtime and must be rewritten using `Attr` conditions.
- The frontend's `lib/api.js` exposes only a generic `api(method, path, body)` function; pages embed raw path strings and HTTP verbs inline, making refactoring and typo detection difficult
- `todayStr()` in `Schedule.jsx` and `todayApiStr()` in `Facility.jsx` are functionally identical date utilities returning `YYYY-MM-DD` / `YYYY/MM/DD` strings; `Facility.jsx` also has `todayLocalStr()` returning `YYYY/MM/DD`. These will be consolidated in `helpers.js`.
- `Facility.jsx`, `Schedule.jsx`, and `Users.jsx` each check `res.error` on successful API responses, but the `api()` client already throws on non-2xx status — `res` is always a parsed success body, so `res.error` is never set. All instances of this dead check will be removed.

---

## 2. Backend Design

### 2.1 Approach

Keep the four Lambda functions as separate SAM deployments (Lambda structure unchanged). Extend the existing `layers/common/python/` layer with two new modules that absorb all duplicated code.

`DocumentsFunction` handles both HTTP and S3 events, so a monolithic merge would complicate event routing with no practical benefit.

### 2.2 New Files in `layers/common/python/`

#### `utils.py`
Absorbs helpers duplicated across the handlers:

```python
def now_iso() -> str:
    """Return current UTC time as ISO-8601 string.
    Used by facilities, schedules, documents handlers (not users)."""

def get_method_and_path(event: dict) -> tuple[str, str]:
    """Extract HTTP method and path from Lambda event requestContext.
    Used by all four handlers."""
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

**All four handlers:**
1. Remove local `_get_method_and_path` definition; import `from utils import get_method_and_path`
2. Replace the manual `lambda_handler` routing block with a `Router` instance

**`facilities`, `schedules`, `documents` only:**
3. Remove local `_now_iso` definition; import `from utils import now_iso`

**`documents/handler.py` special case:**
The `lambda_handler` in `documents` must check for S3 events before dispatching HTTP routes. The structure remains:

```python
def lambda_handler(event, context):
    if _is_s3_event(event):
        handle_s3_event(event)
        return {"statusCode": 200}
    return router.dispatch(event)
```

`Router.dispatch` is only called for HTTP events; S3 events bypass it entirely.

**Bug fixes:**
- `facilities/handler.py` `list_facilities`: remove dead `table.query()`, rewrite `table.scan()` using `Attr` filter conditions
- `documents/handler.py` `list_folders`: remove dead `table.query()` (the scan filter is correct)

No other business logic changes. No SAM template changes.

### 2.4 Bug Fixes

| File | Function | Bug | Fix |
|------|----------|-----|-----|
| `facilities/handler.py` | `list_facilities` | Dead `table.query(PK.begins_with(...))` — DynamoDB does not support `begins_with` on PK in `query`; the call errors and is immediately discarded | Remove the dead query call |
| `facilities/handler.py` | `list_facilities` | `table.scan(FilterExpression="begins_with(PK, :prefix)")` — `begins_with` is not valid in a FilterExpression; must use `Attr("PK").begins_with("FACILITY#") & Attr("SK").eq("#METADATA")` | Rewrite using boto3 `Attr` conditions |
| `documents/handler.py` | `list_folders` | Dead `table.query()` before `table.scan()` (same dead-query pattern) | Remove the dead query call. The scan's existing `Attr`-style filter is correct. |

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
    index.js         ← re-exports all named functions + api, setAuthToken, clearAuthToken, setUnauthorizedHandler
```

`lib/api.js` is removed; all imports updated to `'../lib/api'` (pointing to `index.js` via the directory).

### 3.3 `helpers.js` Additions

Add two date utility functions to consolidate duplicated inline helpers:

```js
// Returns today as 'YYYY/MM/DD' (for date picker inputs)
export function todayLocalStr() { ... }

// Returns today as 'YYYY-MM-DD' (for API query params)
export function todayApiStr() { ... }
```

**What gets removed:**
- `Facility.jsx`: `todayLocalStr()` and `todayApiStr()` inline definitions → replaced by imports
- `Schedule.jsx`: `todayStr()` inline definition (returns `YYYY/MM/DD`, same as `todayLocalStr`) → replaced by `todayLocalStr` import

### 3.4 Bug Fixes

The `api()` client in `lib/api.js` throws `Promise.reject(new Error(...))` on any non-2xx response. This means after a successful `await api(...)`, the result is always a parsed success body — `res.error` can never be set. All three pages below have dead `res.error` checks that will be removed.

| File | Location | Dead Check | Fix |
|------|----------|-----------|-----|
| `Facility.jsx` | `handleSubmit` | `if (res.error === 'CONFLICT')` and `if (res.error)` | Remove both checks. Catch rejected promise and map error message to user-facing message. |
| `Schedule.jsx` | `loadEvents`, `handleSubmit`, `handleDelete`, `handleEventMove` | Multiple `if (res.error ...)` checks | Remove all `res.error` checks; rely on thrown errors propagating to the catch block. |
| `Users.jsx` | API call handlers | `if (res.error ...)` | Remove the check; rely on thrown errors. |

### 3.5 Page Changes

Each page replaces inline `api(method, path)` calls with the corresponding named functions from `lib/api`. No UI changes. No component splits (out of scope for this refactoring).

---

## 4. Testing

- Backend: existing tests in `functions/facilities/tests/` and `functions/schedules/tests/` continue to pass without modification (behavior unchanged). Note: tests rely on `sys.path.insert` for both handler and layer paths — `utils.py` and `router.py` must be created in the layer **before** refactoring the handlers, otherwise the handler imports will fail during test runs.
- New `utils.py` and `router.py` are pure functions — unit-testable without mocks
- Frontend: no test suite currently exists; the API layer extraction improves testability for future tests (each domain module can be mocked independently)

---

## 5. Out of Scope

- Component splitting in the frontend (e.g., extracting sub-components from `Schedule.jsx`)
- Custom React hooks (`useSchedule`, `useFacility`, etc.)
- SAM infrastructure changes
- New features or behavior changes
