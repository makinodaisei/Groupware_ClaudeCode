# Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate code duplication across backend Lambda handlers and frontend pages, fix latent DynamoDB bugs and dead `res.error` checks, and introduce a domain-specific API layer in the frontend.

**Architecture:** Backend: two new shared modules (`utils.py`, `router.py`) added to `layers/common/python/`; each handler imports from them and removes its inline duplicates. Frontend: `lib/api.js` replaced by a `lib/api/` directory with per-domain modules wrapping the generic client.

**Tech Stack:** Python 3.12, boto3/moto, pytest; React 18, Vite, plain JS (no TypeScript).

---

## File Map

### Created
| Path | Purpose |
|------|---------|
| `backend/layers/common/python/utils.py` | `now_iso()`, `get_method_and_path()` shared across handlers |
| `backend/layers/common/python/router.py` | `Router` class — registers routes and dispatches by method+path regex |
| `backend/layers/common/python/tests/__init__.py` | Makes directory a pytest package |
| `backend/layers/common/python/tests/test_utils.py` | Tests for utils.py |
| `backend/layers/common/python/tests/test_router.py` | Tests for router.py |
| `frontend/src/lib/api/client.js` | Generic `api()` function + `ApiError` class (moved from `lib/api.js`) |
| `frontend/src/lib/api/schedules.js` | Schedule domain API functions |
| `frontend/src/lib/api/facilities.js` | Facility and reservation API functions |
| `frontend/src/lib/api/documents.js` | Folder and file API functions |
| `frontend/src/lib/api/users.js` | User management API functions |
| `frontend/src/lib/api/index.js` | Re-exports all named functions + client utilities |

### Modified
| Path | Change |
|------|--------|
| `backend/functions/facilities/handler.py` | Remove `_get_method_and_path`, `_now_iso`; import from utils; use Router; fix `list_facilities` DynamoDB bugs |
| `backend/functions/schedules/handler.py` | Remove `_get_method_and_path`, `_now_iso`; import from utils; use Router |
| `backend/functions/documents/handler.py` | Remove `_get_method_and_path`, `_now_iso`; import from utils; use Router; fix `list_folders` dead query + raw string FilterExpression |
| `backend/functions/users/handler.py` | Remove `_get_method_and_path`; import from utils; use Router |
| `frontend/src/lib/helpers.js` | Add `todayLocalStr()` and `todayApiStr()` |
| `frontend/src/pages/Facility.jsx` | Use facilities API module; remove inline `todayLocalStr`/`todayApiStr`; fix dead `res.error` checks |
| `frontend/src/pages/Schedule.jsx` | Use schedules API module; replace `todayStr` with `todayLocalStr`; fix dead `res.error` checks |
| `frontend/src/pages/Documents.jsx` | Use documents API module |
| `frontend/src/pages/Users.jsx` | Use users API module; fix dead `res.error` check |

### Deleted
| Path | Reason |
|------|--------|
| `frontend/src/lib/api.js` | Superseded by `lib/api/` directory |

---

## Task 1: Create `utils.py` tests (TDD first)

**Files:**
- Create: `backend/layers/common/python/tests/__init__.py`
- Create: `backend/layers/common/python/tests/test_utils.py`

- [ ] **Step 1: Create the tests directory and write failing tests**

Create `backend/layers/common/python/tests/__init__.py` (empty).

Create `backend/layers/common/python/tests/test_utils.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest backend/layers/common/python/tests/test_utils.py -v
```

Expected: `ModuleNotFoundError: No module named 'utils'`

---

## Task 2: Implement `utils.py` and make tests pass

**Files:**
- Create: `backend/layers/common/python/utils.py`

- [ ] **Step 1: Write `utils.py`**

```python
"""Shared utilities for all Groupware Lambda handlers."""
from datetime import datetime, timezone


def now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def get_method_and_path(event: dict) -> tuple[str, str]:
    """Extract HTTP method and path from Lambda event requestContext."""
    ctx = event.get("requestContext", {}).get("http", {})
    return ctx.get("method", ""), ctx.get("path", "")
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
python -m pytest backend/layers/common/python/tests/test_utils.py -v
```

Expected: 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/layers/common/python/utils.py \
        backend/layers/common/python/tests/__init__.py \
        backend/layers/common/python/tests/test_utils.py
git commit -m "feat: add utils.py to common layer with shared now_iso and get_method_and_path"
```

---

## Task 3: Create `router.py` tests (TDD first)

**Files:**
- Create: `backend/layers/common/python/tests/test_router.py`

- [ ] **Step 1: Write failing tests**

Create `backend/layers/common/python/tests/test_router.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest backend/layers/common/python/tests/test_router.py -v
```

Expected: `ModuleNotFoundError: No module named 'router'`

---

## Task 4: Implement `router.py` and make tests pass

**Files:**
- Create: `backend/layers/common/python/router.py`

- [ ] **Step 1: Write `router.py`**

```python
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
                if route_method == method and re.match(pattern, path):
                    return handler(event)
            return response.not_found("Endpoint")
        except Exception as e:
            logger.exception("Unhandled error in router dispatch")
            return response.server_error(str(e))
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
python -m pytest backend/layers/common/python/tests/test_router.py -v
```

Expected: 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/layers/common/python/router.py \
        backend/layers/common/python/tests/test_router.py
git commit -m "feat: add Router class to common layer"
```

---

## Task 5: Refactor `facilities/handler.py` and fix bugs

**Files:**
- Modify: `backend/functions/facilities/handler.py`

The existing tests in `backend/functions/facilities/tests/test_handler.py` serve as the regression suite — run them before and after to confirm nothing breaks.

- [ ] **Step 1: Run existing tests to confirm they currently pass**

```bash
python -m pytest backend/functions/facilities/tests/ -v
```

Expected: all tests PASS

- [ ] **Step 2: Refactor the handler**

Open `backend/functions/facilities/handler.py` and make the following changes:

**Add to imports at the top** (keep all existing imports — `datetime`, `timezone`, `timedelta` are still used by `create_reservation`):
```python
from utils import now_iso, get_method_and_path
from router import Router
```

**Remove** the `_get_method_and_path` function definition (~lines 22-25):
```python
# DELETE this entire function:
def _get_method_and_path(event: dict) -> tuple[str, str]:
    ctx = event.get("requestContext", {}).get("http", {})
    return ctx.get("method", ""), ctx.get("path", "")
```

**Remove** the `_now_iso` function definition:
```python
# DELETE this entire function:
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
```

**Fix `list_facilities`** — replace the entire function body:

```python
def list_facilities(event: dict) -> dict:
    from boto3.dynamodb.conditions import Attr
    table = get_table()
    resp = table.scan(
        FilterExpression=Attr("PK").begins_with("FACILITY#") & Attr("SK").eq("#METADATA"),
    )
    facilities = [_item_to_facility(item) for item in resp.get("Items", [])]
    return response.ok({"facilities": facilities})
```

**Replace `_now_iso()` calls** with `now_iso()` throughout the file (in `create_facility`, `create_reservation`).

**Replace the `lambda_handler` routing block** with a Router. At module level (after all function definitions), add:

```python
_router = Router()
_router.add("GET",    r".*/facilities$",                               list_facilities)
_router.add("POST",   r".*/facilities$",                               create_facility)
_router.add("GET",    r".*/facilities/[^/]+$",                         get_facility)
_router.add("GET",    r".*/facilities/[^/]+/reservations$",            list_reservations)
_router.add("POST",   r".*/facilities/[^/]+/reservations$",            create_reservation)
_router.add("DELETE", r".*/facilities/[^/]+/reservations/[^/]+$",      delete_reservation)
```

**Replace the `lambda_handler` body** with:

```python
def lambda_handler(event: dict, context) -> dict:
    logger.info("Facilities event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
```

- [ ] **Step 3: Run existing tests to confirm they still pass**

```bash
python -m pytest backend/functions/facilities/tests/ -v
```

Expected: all tests PASS (same results as Step 1)

- [ ] **Step 4: Commit**

```bash
git add backend/functions/facilities/handler.py
git commit -m "refactor: facilities handler — use utils/Router, fix list_facilities DynamoDB scan bug"
```

---

## Task 6: Refactor `schedules/handler.py`

**Files:**
- Modify: `backend/functions/schedules/handler.py`

- [ ] **Step 1: Run existing tests**

```bash
python -m pytest backend/functions/schedules/tests/ -v
```

Expected: all tests PASS

- [ ] **Step 2: Refactor the handler**

**Add imports:**
```python
from utils import now_iso, get_method_and_path
from router import Router
```

**Remove** `_get_method_and_path` function definition.

**Remove** `_now_iso` function definition.

**Replace** all `_now_iso()` calls with `now_iso()` (in `create_schedule`, `update_schedule`).

**Add router at module level** (after all function definitions):

```python
_router = Router()
_router.add("GET",    r".*/schedules$",          list_schedules)
_router.add("POST",   r".*/schedules$",          create_schedule)
_router.add("GET",    r".*/schedules/[^/]+$",    get_schedule)
_router.add("PUT",    r".*/schedules/[^/]+$",    update_schedule)
_router.add("DELETE", r".*/schedules/[^/]+$",    delete_schedule)
```

**Replace `lambda_handler` body:**

```python
def lambda_handler(event: dict, context) -> dict:
    logger.info("Schedules event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
```

- [ ] **Step 3: Run tests**

```bash
python -m pytest backend/functions/schedules/tests/ -v
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/functions/schedules/handler.py
git commit -m "refactor: schedules handler — use utils/Router"
```

---

## Task 7: Refactor `documents/handler.py` and fix dead query bug

**Files:**
- Modify: `backend/functions/documents/handler.py`

- [ ] **Step 1: Refactor the handler**

**Add imports:**
```python
from utils import now_iso, get_method_and_path
from router import Router
```

**Remove** `_get_method_and_path` and `_now_iso` function definitions.

**Replace** all `_now_iso()` calls with `now_iso()`.

**Fix `list_folders`** — remove the dead `table.query()` call AND replace the raw string `FilterExpression` with `Attr` conditions (the existing scan uses raw string syntax `"parentFolderId = :parent AND entityType = :t"` which is unreliable with the boto3 resource interface). The function should be:

```python
def list_folders(event: dict) -> dict:
    params = event.get("queryStringParameters") or {}
    parent_id = params.get("parentFolderId", "ROOT")

    from boto3.dynamodb.conditions import Attr
    table = get_table()
    resp = table.scan(
        FilterExpression=Attr("parentFolderId").eq(parent_id) & Attr("entityType").eq("FOLDER"),
    )
    folders = [_item_to_folder(item) for item in resp.get("Items", [])]
    return response.ok({"folders": folders})
```

**Add router at module level** (after all function definitions):

```python
_router = Router()
_router.add("GET",    r".*/documents/folders$",                                      list_folders)
_router.add("POST",   r".*/documents/folders$",                                      create_folder)
_router.add("DELETE", r".*/documents/folders/[^/]+$",                               delete_folder)
_router.add("GET",    r".*/documents/folders/[^/]+/files$",                         list_files)
_router.add("POST",   r".*/documents/folders/[^/]+/files/upload-url$",              get_upload_url)
_router.add("GET",    r".*/documents/folders/[^/]+/files/[^/]+/download-url$",      get_download_url)
_router.add("DELETE", r".*/documents/folders/[^/]+/files/[^/]+$",                   delete_file)
```

**Replace `lambda_handler` body** (keep the S3 event check before dispatching):

```python
def lambda_handler(event: dict, context) -> dict:
    if _is_s3_event(event):
        handle_s3_event(event)
        return {"statusCode": 200}

    logger.info("Documents event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
```

- [ ] **Step 2: Commit**

```bash
git add backend/functions/documents/handler.py
git commit -m "refactor: documents handler — use utils/Router, fix list_folders dead query"
```

---

## Task 8: Refactor `users/handler.py`

**Files:**
- Modify: `backend/functions/users/handler.py`

- [ ] **Step 1: Refactor the handler**

**Add imports:**
```python
from utils import get_method_and_path
from router import Router
```

Note: `now_iso` is NOT needed — the users handler delegates timestamps to Cognito.

**Remove** `_get_method_and_path` function definition.

**Add router at module level:**

```python
_router = Router()
_router.add("GET",    r".*/users$",          list_users)
_router.add("POST",   r".*/users$",          create_user)
_router.add("GET",    r".*/users/[^/]+$",    get_user)
_router.add("PUT",    r".*/users/[^/]+$",    update_user)
_router.add("DELETE", r".*/users/[^/]+$",    delete_user)
```

**Replace `lambda_handler` body:**

```python
def lambda_handler(event: dict, context) -> dict:
    logger.info("Users event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
```

- [ ] **Step 2: Run the full backend test suite**

```bash
python -m pytest backend/ -v
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/functions/users/handler.py
git commit -m "refactor: users handler — use utils/Router"
```

---

## Task 9: Create `frontend/src/lib/api/client.js`

**Files:**
- Create: `frontend/src/lib/api/client.js`

This is a direct move of `lib/api.js` with one addition: an `ApiError` class that carries the HTTP status code so callers can map specific statuses (e.g., 409 Conflict) to localized messages.

- [ ] **Step 1: Create `client.js`**

```js
import { CONFIG } from '../auth.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let _token = null;
let _onUnauthorized = null;

export function setAuthToken(token) {
  _token = token;
}

export function clearAuthToken() {
  _token = null;
}

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

export async function api(method, path, body) {
  const url = CONFIG.apiEndpoint + path;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  if (resp.status === 401) {
    if (_onUnauthorized) _onUnauthorized();
    throw new ApiError(401, 'セッションが切れました。再度ログインしてください');
  }
  if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
  return resp.json().catch(() => ({}));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api/client.js
git commit -m "feat: add api/client.js with ApiError class (moved from lib/api.js)"
```

---

## Task 10: Create domain API modules

**Files:**
- Create: `frontend/src/lib/api/schedules.js`
- Create: `frontend/src/lib/api/facilities.js`
- Create: `frontend/src/lib/api/documents.js`
- Create: `frontend/src/lib/api/users.js`

- [ ] **Step 1: Create `schedules.js`**

```js
import { api } from './client.js';

export function getSchedules({ month, start, end } = {}) {
  if (month) return api('GET', `/schedules?month=${month}`);
  if (start && end) return api('GET', `/schedules?start=${start}&end=${end}`);
  return Promise.reject(new Error("Provide 'month' or 'start'+'end'"));
}

export function createSchedule(data) {
  return api('POST', '/schedules', data);
}

export function updateSchedule(id, data) {
  return api('PUT', `/schedules/${id}`, data);
}

export function deleteSchedule(id) {
  return api('DELETE', `/schedules/${id}`);
}
```

- [ ] **Step 2: Create `facilities.js`**

```js
import { api } from './client.js';

export function getFacilities() {
  return api('GET', '/facilities');
}

export function getReservations(facilityId, date) {
  return api('GET', `/facilities/${facilityId}/reservations?date=${date}`);
}

export function createReservation(facilityId, data) {
  return api('POST', `/facilities/${facilityId}/reservations`, data);
}

export function deleteReservation(facilityId, reservationId) {
  return api('DELETE', `/facilities/${facilityId}/reservations/${reservationId}`);
}
```

- [ ] **Step 3: Create `documents.js`**

```js
import { api } from './client.js';

export function getFolders(parentFolderId) {
  const qs = parentFolderId ? `?parentFolderId=${parentFolderId}` : '';
  return api('GET', `/documents/folders${qs}`);
}

export function createFolder(data) {
  return api('POST', '/documents/folders', data);
}

export function deleteFolder(folderId) {
  return api('DELETE', `/documents/folders/${folderId}`);
}

export function getFiles(folderId) {
  return api('GET', `/documents/folders/${folderId}/files`);
}

export function getUploadUrl(folderId, data) {
  return api('POST', `/documents/folders/${folderId}/files/upload-url`, data);
}

export function getDownloadUrl(folderId, fileId) {
  return api('GET', `/documents/folders/${folderId}/files/${fileId}/download-url`);
}

export function deleteFile(folderId, fileId) {
  return api('DELETE', `/documents/folders/${folderId}/files/${fileId}`);
}
```

- [ ] **Step 4: Create `users.js`**

```js
import { api } from './client.js';

export function getUsers(params = {}) {
  const qs = params.limit ? `?limit=${params.limit}` : '';
  return api('GET', `/users${qs}`);
}

export function getUser(userId) {
  return api('GET', `/users/${userId}`);
}

export function createUser(data) {
  return api('POST', '/users', data);
}

export function updateUser(userId, data) {
  return api('PUT', `/users/${userId}`, data);
}

export function deleteUser(userId) {
  return api('DELETE', `/users/${userId}`);
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/schedules.js \
        frontend/src/lib/api/facilities.js \
        frontend/src/lib/api/documents.js \
        frontend/src/lib/api/users.js
git commit -m "feat: add domain-specific API modules (schedules, facilities, documents, users)"
```

---

## Task 11: Create `api/index.js` and delete `api.js`

**Files:**
- Create: `frontend/src/lib/api/index.js`
- Delete: `frontend/src/lib/api.js`

- [ ] **Step 1: Create `index.js`**

```js
export { api, ApiError, setAuthToken, clearAuthToken, setUnauthorizedHandler } from './client.js';
export { getSchedules, createSchedule, updateSchedule, deleteSchedule } from './schedules.js';
export { getFacilities, getReservations, createReservation, deleteReservation } from './facilities.js';
export { getFolders, createFolder, deleteFolder, getFiles, getUploadUrl, getDownloadUrl, deleteFile } from './documents.js';
export { getUsers, getUser, createUser, updateUser, deleteUser } from './users.js';
```

- [ ] **Step 2: Delete `lib/api.js`**

```bash
rm frontend/src/lib/api.js
```

- [ ] **Step 3: Confirm no other files import the old `lib/api.js` path**

```bash
grep -r "from '../lib/api'" frontend/src/pages/
grep -r "from '../lib/api'" frontend/src/contexts/
```

These imports resolve to `api/index.js` via the directory. Confirm the files listed are only the page files you'll update in Tasks 13-16 (Facility.jsx, Schedule.jsx, Documents.jsx, Users.jsx, and any context files). There should be no imports pointing at the now-deleted `api.js` file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/index.js
git rm frontend/src/lib/api.js
git commit -m "feat: add api/index.js barrel, remove legacy api.js"
```

---

## Task 12: Update `helpers.js` with date utilities

**Files:**
- Modify: `frontend/src/lib/helpers.js`

- [ ] **Step 1: Add `todayLocalStr` and `todayApiStr` to `helpers.js`**

Append to the end of `frontend/src/lib/helpers.js`:

```js
// Returns today as 'YYYY/MM/DD' — matches the slash format used by DatePicker inputs.
// Same format as fromISO's date return value.
export function todayLocalStr() {
  const n = new Date();
  return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')}`;
}

// Returns today as 'YYYY-MM-DD' — for API query parameters.
export function todayApiStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/helpers.js
git commit -m "feat: add todayLocalStr and todayApiStr to helpers.js"
```

---

## Task 13: Update `Facility.jsx`

**Files:**
- Modify: `frontend/src/pages/Facility.jsx`

- [ ] **Step 1: Update imports**

Replace:
```js
import { api } from '../lib/api';
import { toISO } from '../lib/helpers';
```
With:
```js
import { getFacilities, getReservations, createReservation } from '../lib/api';
import { toISO, todayLocalStr, todayApiStr } from '../lib/helpers';
```

- [ ] **Step 2: Remove inline date helpers**

Delete the `todayLocalStr` and `todayApiStr` function definitions from inside the component file (they are now imported from `helpers.js`).

- [ ] **Step 3: Update API calls**

Replace:
```js
const data = await api('GET', '/facilities');
```
With:
```js
const data = await getFacilities();
```

Replace:
```js
api('GET', `/facilities/${f.facilityId}/reservations?date=${today}`)
```
With:
```js
getReservations(f.facilityId, today)
```

Replace the `handleSubmit` reservation call and fix the dead `res.error` checks:
```js
async function handleSubmit(fd) {
  if (!fd.title?.trim()) throw '予約タイトルを入力してください';
  if (!form.startDate || !form.endDate) throw '日付を入力してください';
  const start = toISO(form.startDate, form.startTime);
  const end = toISO(form.endDate, form.endTime);
  if (new Date(end) <= new Date(start)) throw '終了時刻は開始時刻より後にしてください';
  try {
    await createReservation(selectedFacility.facilityId, {
      title: fd.title.trim(), startDatetime: start, endDatetime: end, notes: fd.notes || ''
    });
  } catch (err) {
    if (err.status === 409) throw 'その時間帯は既に予約されています。別の時間を選択してください。';
    throw err.message || 'エラーが発生しました';
  }
  showToast('予約が完了しました', 'success');
  load();
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Facility.jsx
git commit -m "refactor: Facility.jsx — use facilities API module, fix dead res.error checks"
```

---

## Task 14: Update `Schedule.jsx`

**Files:**
- Modify: `frontend/src/pages/Schedule.jsx`

- [ ] **Step 1: Update imports**

Replace:
```js
import { api } from '../lib/api';
```
With:
```js
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '../lib/api';
```

Add `todayLocalStr` to the helpers import:
```js
import { toISO, fromISO, todayLocalStr } from '../lib/helpers';
```

- [ ] **Step 2: Remove the inline `todayStr` function**

Delete the `todayStr()` function definition from inside the file.

Replace all calls to `todayStr()` with `todayLocalStr()`.

- [ ] **Step 3: Replace `api()` calls**

Replace `loadEvents` fetch calls:
```js
// month view
const data = await getSchedules({ month: monthStr });

// week view (two-month span)
const results = await Promise.all([...months].map(mo => getSchedules({ month: mo })));
```

Replace `handleSubmit` calls and remove dead `res.error` checks:
```js
async function handleSubmit(fd) {
  // ... existing validation ...
  if (editEvent) {
    await updateSchedule(editEvent.eventId, { title: fd.title.trim(), location: fd.location || '', startDatetime: start, endDatetime: end, isPublic: !!form.isPublic });
  } else {
    await createSchedule({ title: fd.title.trim(), location: fd.location || '', startDatetime: start, endDatetime: end, isPublic: !!form.isPublic });
  }
  // (remove the if (res.error) checks that followed)
}
```

Replace `handleDelete`:
```js
async function handleDelete(id) {
  await deleteSchedule(id);
  // (remove the if (res && res.error) check that followed the old api() call)
  loadEvents();
}
```

Replace `handleEventMove`:
```js
async function handleEventMove(event, startISO, endISO) {
  await updateSchedule(event.eventId, { startDatetime: startISO, endDatetime: endISO });
  // (remove the if (res.error) check)
  loadEvents();
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Schedule.jsx
git commit -m "refactor: Schedule.jsx — use schedules API module, fix dead res.error checks, replace todayStr"
```

---

## Task 15: Update `Documents.jsx`

**Files:**
- Modify: `frontend/src/pages/Documents.jsx`

- [ ] **Step 1: Update imports**

Replace:
```js
import { api } from '../lib/api';
```
With:
```js
import { getFolders, createFolder, getFiles, getUploadUrl, getDownloadUrl } from '../lib/api';
```

- [ ] **Step 2: Replace `api()` calls**

```js
// loadFolders
const data = await getFolders();

// loadFiles
const data = await getFiles(folderId);

// createFolder
await createFolder(body);

// downloadFile
const data = await getDownloadUrl(currentFolderId, fileId);

// uploadFile — get presigned URL
uploadData = await getUploadUrl(currentFolderId, {
  name: file.name, contentType: file.type || 'application/octet-stream', size: file.size
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Documents.jsx
git commit -m "refactor: Documents.jsx — use documents API module"
```

---

## Task 16: Update `Users.jsx` and fix dead `res.error` check

**Files:**
- Modify: `frontend/src/pages/Users.jsx`

- [ ] **Step 1: Update imports**

Replace:
```js
import { api } from '../lib/api';
```
With:
```js
import { getUsers, createUser } from '../lib/api';
```

- [ ] **Step 2: Replace `api()` calls and fix dead `res.error` check**

Replace `loadUsers` call:
```js
const data = await getUsers();
```

Replace `handleSubmit` (the `create_user` call) and remove the dead `res.error` check:
```js
// Before:
const res = await api('POST', '/users', { email: fd.email.trim(), name: fd.name.trim(), role: fd.role || 'user' });
if (res.error) throw res.message || 'エラーが発生しました';

// After:
await createUser({ email: fd.email.trim(), name: fd.name.trim(), role: fd.role || 'user' });
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Users.jsx
git commit -m "refactor: Users.jsx — use users API module, fix dead res.error check"
```

---

## Task 17: Final verification

- [ ] **Step 1: Run the full backend test suite**

```bash
python -m pytest backend/ -v
```

Expected: all tests PASS

- [ ] **Step 2: Confirm no remaining imports of the deleted `api.js`**

```bash
grep -r "lib/api.js" frontend/src/
```

Expected: no matches

- [ ] **Step 3: Confirm no remaining `res.error` dead checks**

```bash
grep -n "res\.error" frontend/src/pages/
```

Expected: no matches

- [ ] **Step 4: Confirm no remaining `_now_iso\|_get_method_and_path` in handlers**

```bash
grep -n "_now_iso\|_get_method_and_path" backend/functions/*/handler.py
```

Expected: no matches

- [ ] **Step 5: Start the frontend dev server and verify the app loads**

```bash
cd frontend && npm run dev
```

Open the app and confirm the Schedule, Facility, Documents, and Users pages load without console errors.

- [ ] **Step 6: Confirm no untracked files remain**

```bash
git status
```

All changes should already be committed from individual task steps. If `git status` shows any untracked or modified files, investigate before staging — do not use `git add -A` as it may pick up build artifacts like `.vite/`.
