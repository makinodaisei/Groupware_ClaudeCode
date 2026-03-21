# 施設マスタ・ユーザーマスタ・権限管理 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin/editor/user の3ロール体制、施設マスタ CRUD（2階層）、ユーザーマスタ CRUD（有効/無効化・削除）、管理設定ページ新設、サイドバーのアイコン+テキスト常設化を実装する。

**Architecture:** 既存の Lambda+DynamoDB+Cognito バックエンドにロールと API を追加し、React フロントエンドに管理ページを新設する。権限チェックは `cognito:groups` ベースの既存パターンを踏襲する。

**Tech Stack:** Python 3.12 / Lambda / DynamoDB / Cognito / SAM (template.yaml) / React (JSX) / pytest + moto

---

## ファイルマップ

### 新規作成
- `backend/tests/__init__.py` — テストパッケージ初期化
- `backend/tests/test_auth.py` — auth.py のテスト
- `backend/tests/test_users.py` — users/handler.py のテスト
- `backend/tests/test_facilities.py` — facilities/handler.py のテスト
- `backend/tests/test_documents.py` — documents/handler.py のテスト
- `frontend/src/pages/Admin.jsx` — 管理設定ページ（ユーザーマスタ＋施設マスタタブ）

### 変更
- `backend/layers/common/python/auth.py` — `is_editor()` 追加
- `backend/functions/users/handler.py` — editor ロール、enable/disable、グループ同期
- `backend/functions/facilities/handler.py` — 階層対応、PUT/DELETE 追加
- `backend/functions/documents/handler.py` — editor ロールチェック追加
- `template.yaml` — editor グループ、IAM アクション、施設 PUT/DELETE ルート
- `frontend/src/styles/globals.css` — サイドバー幅変更（52px → 200px）
- `frontend/src/components/Sidebar.jsx` — アイコン+テキスト常設、管理設定リンク追加
- `frontend/src/lib/api/facilities.js` — 施設 CRUD API 追加
- `frontend/src/App.jsx` — /admin ルート追加、/users リダイレクト
- `docs/db-definition.md` — role・施設スキーマ更新
- `docs/api-spec.md` — 施設 PUT/DELETE、ユーザー PUT 拡張反映

---

## Task 1: auth.py に `is_editor()` を追加

**Files:**
- Modify: `backend/layers/common/python/auth.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: テストファイルを作成する**

`backend/tests/__init__.py` を空ファイルで作成。

`backend/tests/test_auth.py`:

```python
"""Tests for auth.py helpers."""
import os
import sys
import pytest

# パスを絶対パスで解決する（どのディレクトリから pytest を実行しても動作する）
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "layers", "common", "python"))

import auth


def _make_event(groups: list[str]) -> dict:
    groups_str = str(groups) if groups else ""
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
```

- [ ] **Step 2: テストが失敗することを確認する**

```
cd backend && python -m pytest tests/test_auth.py::test_is_editor_true -v
```
期待: FAIL（`is_editor` が未定義）

- [ ] **Step 3: `auth.py` を実装する**

`backend/layers/common/python/auth.py` の末尾に追加:

```python
def is_editor(event: dict) -> bool:
    """Return True if user is in the editor Cognito group."""
    return "editor" in get_groups(event)


def require_editor_or_above(event: dict) -> Optional[dict]:
    """Return 403 response if user is neither admin nor editor, else None."""
    if not is_admin(event) and not is_editor(event):
        return response.forbidden("Editor or admin access required")
    return None
```

- [ ] **Step 4: テストが通ることを確認する**

```
cd backend && python -m pytest tests/test_auth.py -v
```
期待: 全テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add backend/layers/common/python/auth.py backend/tests/
git commit -m "feat: add is_editor and require_editor_or_above to auth.py"
```

---

## Task 2: template.yaml に editor グループと IAM アクションを追加

**Files:**
- Modify: `template.yaml`

- [ ] **Step 1: `editor` Cognito グループを追加する**

`template.yaml` の `CognitoUserPoolGroupUser`（user グループのリソース定義, ~94行目）の直後に追加:

```yaml
  CognitoUserPoolGroupEditor:
    Type: AWS::Cognito::UserPoolGroup
    Properties:
      GroupName: editor
      UserPoolId: !Ref CognitoUserPool
```

- [ ] **Step 2: `UsersFunction` IAM ポリシーに `AdminEnableUser` / `AdminDisableUser` を追加する**

`template.yaml` の `cognito-idp:ListUsersInGroup`（~165行目）の後に追加:

```yaml
              - cognito-idp:AdminEnableUser
              - cognito-idp:AdminDisableUser
```

- [ ] **Step 3: 施設 PUT ルートを追加する**

`FacilitiesProxyDelete` は template.yaml に既存（~276行目）。`FacilitiesProxyPut` のみ追加する。
`FacilitiesProxyDelete`（~276行目）の後に追加:

```yaml
        FacilitiesProxyPut:
          Type: HttpApi
          Properties:
            ApiId: !Ref GroupwareApi
            Path: /facilities/{proxy+}
            Method: PUT
```

- [ ] **Step 4: `sam validate` で構文チェックする**

```
sam validate --region ap-northeast-1
```
期待: template.yaml validation succeeded

- [ ] **Step 5: コミットする**

```bash
git add template.yaml
git commit -m "feat: add editor Cognito group, IAM enable/disable actions, facility PUT/DELETE routes"
```

---

## Task 3: users/handler.py に editor ロール・有効/無効化・グループ同期を追加

**Files:**
- Modify: `backend/functions/users/handler.py`
- Create: `backend/tests/test_users.py`

- [ ] **Step 1: テストファイルを作成する**

`backend/tests/test_users.py`:

```python
"""Tests for users/handler.py."""
import json
import os
import sys
import pytest

import boto3
from moto import mock_aws

# パスを絶対パスで解決する
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "layers", "common", "python"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "functions", "users"))


def _make_admin_event(method: str, path: str, body: dict = None, sub: str = "admin-sub") -> dict:
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": sub,
                        "email": "admin@example.com",
                        "cognito:groups": "['admin']",
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": None,
    }


@mock_aws
def test_create_user_with_editor_role():
    """editor ロールでユーザーを作成できる"""
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(
        PoolName="test-pool",
        Schema=[{"Name": "role", "AttributeDataType": "String", "Mutable": True}],
    )
    pool_id = pool["UserPool"]["Id"]
    os.environ["USER_POOL_ID"] = pool_id
    # editor グループを事前に作成しておく（admin_add_user_to_group に必要）
    for group in ("admin", "editor", "user"):
        cognito.create_group(GroupName=group, UserPoolId=pool_id)

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_admin_event("POST", "/users", {"email": "editor@example.com", "name": "Editor User", "role": "editor"})
    result = handler.create_user(event)
    assert result["statusCode"] == 201
    body = json.loads(result["body"])
    assert body["role"] == "editor"


@mock_aws
def test_create_user_rejects_invalid_role():
    """不正なロールは 400 を返す"""
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(
        PoolName="test-pool",
        Schema=[{"Name": "role", "AttributeDataType": "String", "Mutable": True}],
    )
    os.environ["USER_POOL_ID"] = pool["UserPool"]["Id"]

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_admin_event("POST", "/users", {"email": "x@example.com", "name": "X", "role": "superadmin"})
    result = handler.create_user(event)
    assert result["statusCode"] == 400


@mock_aws
def test_update_user_role_to_editor():
    """admin が user を editor に変更できる"""
    os.environ["USER_POOL_ID"] = USER_POOL_ID
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(PoolName="test-pool", Schema=[{"Name": "role", "AttributeDataType": "String", "Mutable": True}])
    pool_id = pool["UserPool"]["Id"]
    os.environ["USER_POOL_ID"] = pool_id
    cognito.admin_create_user(UserPoolId=pool_id, Username="target@example.com", UserAttributes=[{"Name": "custom:role", "Value": "user"}])
    cognito.create_group(GroupName="editor", UserPoolId=pool_id)
    cognito.create_group(GroupName="user", UserPoolId=pool_id)
    cognito.admin_add_user_to_group(UserPoolId=pool_id, Username="target@example.com", GroupName="user")

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_admin_event("PUT", "/users/target@example.com", {"role": "editor"})
    result = handler.update_user(event)
    assert result["statusCode"] == 200


@mock_aws
def test_update_user_enable_disable():
    """admin が ユーザーを無効化・有効化できる"""
    os.environ["USER_POOL_ID"] = USER_POOL_ID
    cognito = boto3.client("cognito-idp", region_name="us-east-1")
    pool = cognito.create_user_pool(PoolName="test-pool")
    pool_id = pool["UserPool"]["Id"]
    os.environ["USER_POOL_ID"] = pool_id
    cognito.admin_create_user(UserPoolId=pool_id, Username="target@example.com")

    import importlib
    import handler
    importlib.reload(handler)

    # 無効化
    event = _make_admin_event("PUT", "/users/target@example.com", {"enabled": False})
    result = handler.update_user(event)
    assert result["statusCode"] == 200

    # 有効化
    event = _make_admin_event("PUT", "/users/target@example.com", {"enabled": True})
    result = handler.update_user(event)
    assert result["statusCode"] == 200
```

- [ ] **Step 2: テストが失敗することを確認する**

```
cd backend && python -m pytest tests/test_users.py::test_create_user_with_editor_role -v
```
期待: FAIL（`role not in ("admin", "user")` の制約で 400 が返る）

- [ ] **Step 3: `users/handler.py` を実装する**

以下の変更を加える:

**3a. `VALID_ROLES` 定数を追加**（`USER_POOL_ID` 定義の直後）:
```python
VALID_ROLES = ("admin", "editor", "user")
```

**3b. `create_user` の role バリデーションを変更**（~100行目）:
```python
# 変更前:
if role not in ("admin", "user"):
    return response.bad_request("role must be 'admin' or 'user'")

# 変更後:
if role not in VALID_ROLES:
    return response.bad_request(f"role must be one of: {', '.join(VALID_ROLES)}")
```

**3c. `create_user` のグループ割り当てを変更**（~116行目）:
```python
# 変更前:
group = "admin" if role == "admin" else "user"

# 変更後:
group = role  # admin, editor, user それぞれ同名グループ
```

**3d. `update_user` を書き換える**:
```python
def update_user(event: dict) -> dict:
    _, path = get_method_and_path(event)
    target_id = _extract_user_id(path)
    caller_id = auth.get_user_id(event)

    if not auth.is_admin(event) and caller_id != target_id:
        return response.forbidden()

    body = parse_body(event)
    cognito = get_cognito_client()
    attrs = []

    if "name" in body:
        attrs.append({"Name": "name", "Value": sanitize_string(body["name"])})

    if "role" in body:
        if not auth.is_admin(event):
            return response.forbidden("Only admins can change roles")
        role = body["role"]
        if role not in VALID_ROLES:
            return response.bad_request(f"role must be one of: {', '.join(VALID_ROLES)}")
        attrs.append({"Name": "custom:role", "Value": role})

        # Cognito グループのメンバーシップを同期する
        for old_group in VALID_ROLES:
            try:
                cognito.admin_remove_user_from_group(
                    UserPoolId=USER_POOL_ID,
                    Username=target_id,
                    GroupName=old_group,
                )
            except Exception:
                pass  # グループ未所属の場合は無視
        cognito.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=target_id,
            GroupName=role,
        )

    if "enabled" in body:
        if not auth.is_admin(event):
            return response.forbidden("Only admins can enable/disable users")
        if body["enabled"]:
            cognito.admin_enable_user(UserPoolId=USER_POOL_ID, Username=target_id)
        else:
            cognito.admin_disable_user(UserPoolId=USER_POOL_ID, Username=target_id)

    if attrs:
        cognito.admin_update_user_attributes(
            UserPoolId=USER_POOL_ID,
            Username=target_id,
            UserAttributes=attrs,
        )

    return response.ok({"userId": target_id, "updated": True})
```

- [ ] **Step 4: テストが通ることを確認する**

```
cd backend && python -m pytest tests/test_users.py -v
```
期待: 全テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add backend/functions/users/handler.py backend/tests/test_users.py
git commit -m "feat: add editor role, enable/disable, group sync to users handler"
```

---

## Task 4: facilities/handler.py に階層対応・PUT/DELETE を追加

**Files:**
- Modify: `backend/functions/facilities/handler.py`
- Create: `backend/tests/test_facilities.py`

- [ ] **Step 1: テストファイルを作成する**

`backend/tests/test_facilities.py`:

```python
"""Tests for facilities/handler.py."""
import json
import os
import sys
import pytest

import boto3
from moto import mock_aws

# パスを絶対パスで解決する
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "layers", "common", "python"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "functions", "facilities"))


TABLE_NAME = "test-table"


def _make_admin_event(method: str, path: str, body: dict = None) -> dict:
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": "admin-sub",
                        "email": "admin@example.com",
                        "cognito:groups": "['admin']",
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": None,
    }


def _setup_table(dynamodb):
    return dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@mock_aws
def test_create_facility_with_parent_id():
    """parentId を指定して施設を作成できる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    import handler
    importlib.reload(handler)

    # まず親グループを作成
    event = _make_admin_event("POST", "/facilities", {
        "name": "本社ビル",
        "facilityType": "group",
    })
    result = handler.create_facility(event)
    assert result["statusCode"] == 201
    group = json.loads(result["body"])
    group_id = group["facilityId"]

    # 子施設を作成
    event = _make_admin_event("POST", "/facilities", {
        "name": "第1会議室",
        "facilityType": "facility",
        "parentId": group_id,
        "capacity": 10,
    })
    result = handler.create_facility(event)
    assert result["statusCode"] == 201
    body = json.loads(result["body"])
    assert body["parentId"] == group_id
    assert body["facilityType"] == "facility"


@mock_aws
def test_list_facilities_includes_hierarchy_fields():
    """GET /facilities レスポンスに parentId と facilityType が含まれる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_admin_event("POST", "/facilities", {"name": "会議室A"})
    handler.create_facility(event)

    event = _make_admin_event("GET", "/facilities")
    result = handler.list_facilities(event)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    facility = body["facilities"][0]
    assert "parentId" in facility
    assert "facilityType" in facility
    assert facility["parentId"] == "ROOT"
    assert facility["facilityType"] == "facility"


@mock_aws
def test_update_facility():
    """PUT /facilities/{id} で施設情報を更新できる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    import handler
    importlib.reload(handler)

    create_event = _make_admin_event("POST", "/facilities", {"name": "旧会議室名"})
    result = handler.create_facility(create_event)
    facility_id = json.loads(result["body"])["facilityId"]

    update_event = _make_admin_event("PUT", f"/facilities/{facility_id}", {"name": "新会議室名", "capacity": 20})
    result = handler.update_facility(update_event)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["name"] == "新会議室名"
    assert body["capacity"] == 20


@mock_aws
def test_delete_facility_blocks_if_has_children():
    """子施設が存在する親グループは削除不可（409）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    import handler
    importlib.reload(handler)

    # 親グループ作成
    group_event = _make_admin_event("POST", "/facilities", {"name": "グループ", "facilityType": "group"})
    group_id = json.loads(handler.create_facility(group_event)["body"])["facilityId"]

    # 子施設作成
    child_event = _make_admin_event("POST", "/facilities", {"name": "子施設", "parentId": group_id})
    handler.create_facility(child_event)

    # 親を削除しようとすると 409
    delete_event = _make_admin_event("DELETE", f"/facilities/{group_id}")
    result = handler.delete_facility(delete_event)
    assert result["statusCode"] == 409


@mock_aws
def test_delete_facility_success():
    """予約も子施設もない施設は削除できる"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    import handler
    importlib.reload(handler)

    create_event = _make_admin_event("POST", "/facilities", {"name": "削除予定施設"})
    facility_id = json.loads(handler.create_facility(create_event)["body"])["facilityId"]

    delete_event = _make_admin_event("DELETE", f"/facilities/{facility_id}")
    result = handler.delete_facility(delete_event)
    assert result["statusCode"] == 204


@mock_aws
def test_delete_facility_blocks_if_has_reservations():
    """予約が存在する施設は削除不可（409）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    _setup_table(dynamodb)

    import importlib
    import handler
    importlib.reload(handler)

    # 施設を作成
    create_event = _make_admin_event("POST", "/facilities", {"name": "予約あり施設"})
    facility_id = json.loads(handler.create_facility(create_event)["body"])["facilityId"]

    # 予約を直接 DynamoDB に書き込む
    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item={
        "PK": f"FACILITY#{facility_id}",
        "SK": "RESERVATION#2026-03-21T10:00#dummy-id",
        "entityType": "RESERVATION",
        "reservationId": "dummy-id",
        "facilityId": facility_id,
    })

    # 削除しようとすると 409
    delete_event = _make_admin_event("DELETE", f"/facilities/{facility_id}")
    result = handler.delete_facility(delete_event)
    assert result["statusCode"] == 409
```

- [ ] **Step 2: テストが失敗することを確認する**

```
cd backend && python -m pytest tests/test_facilities.py::test_create_facility_with_parent_id -v
```
期待: FAIL（`parentId`, `facilityType` が未対応）

- [ ] **Step 3: `facilities/handler.py` を実装する**

**3a. `_item_to_facility` を更新**（`parentId`, `facilityType` を追加）:
```python
def _item_to_facility(item: dict) -> dict:
    return {
        "facilityId": item.get("facilityId"),
        "name": item.get("name"),
        "description": item.get("description", ""),
        "capacity": item.get("capacity", 1),
        "location": item.get("location", ""),
        "parentId": item.get("parentId", "ROOT"),
        "facilityType": item.get("facilityType", "facility"),
        "createdAt": item.get("createdAt"),
    }
```

**3b. `create_facility` に `parentId`, `facilityType` を追加**（`item` 辞書の組み立て部分）:
```python
    item = {
        # ... 既存フィールド ...
        "parentId": body.get("parentId", "ROOT"),
        "facilityType": body.get("facilityType", "facility"),
    }
```

**3c. `update_facility` 関数を新規追加**（`create_facility` の後）:
```python
def update_facility(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    _, path = get_method_and_path(event)
    facility_id, _ = _extract_ids(path)

    table = get_table()
    resp = table.get_item(Key={"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"})
    if not resp.get("Item"):
        return response.not_found("Facility")

    body = parse_body(event)
    update_expr_parts = []
    expr_attr_values = {}
    expr_attr_names = {}

    if "name" in body:
        update_expr_parts.append("#name = :name")
        expr_attr_names["#name"] = "name"
        expr_attr_values[":name"] = sanitize_string(body["name"], 200)
    if "description" in body:
        update_expr_parts.append("description = :desc")
        expr_attr_values[":desc"] = sanitize_string(body["description"], 1000)
    if "capacity" in body:
        update_expr_parts.append("capacity = :cap")
        expr_attr_values[":cap"] = int(body["capacity"])
    if "location" in body:
        update_expr_parts.append("#loc = :loc")
        expr_attr_names["#loc"] = "location"
        expr_attr_values[":loc"] = sanitize_string(body["location"], 500)

    if not update_expr_parts:
        return response.bad_request("No fields to update")

    kwargs = {
        "Key": {"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"},
        "UpdateExpression": "SET " + ", ".join(update_expr_parts),
        "ExpressionAttributeValues": expr_attr_values,
        "ReturnValues": "ALL_NEW",
    }
    if expr_attr_names:
        kwargs["ExpressionAttributeNames"] = expr_attr_names

    result = table.update_item(**kwargs)
    return response.ok(_item_to_facility(result["Attributes"]))
```

**3d. `delete_facility` 関数を新規追加**（`update_facility` の後）:
```python
def delete_facility(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    _, path = get_method_and_path(event)
    facility_id, _ = _extract_ids(path)
    table = get_table()

    # 子施設チェック
    children = table.scan(
        FilterExpression=Attr("parentId").eq(facility_id) & Attr("SK").eq("#METADATA"),
    )
    if children.get("Items"):
        return response.conflict("Cannot delete a group that has child facilities")

    # 予約チェック
    reservations = table.query(
        KeyConditionExpression=Key("PK").eq(f"FACILITY#{facility_id}") & Key("SK").begins_with("RESERVATION#"),
        Limit=1,
    )
    if reservations.get("Items"):
        return response.conflict("Cannot delete a facility that has reservations")

    table.delete_item(Key={"PK": f"FACILITY#{facility_id}", "SK": "#METADATA"})
    return response.no_content()
```

**3e. Router に PUT/DELETE を追加**:
```python
_router.add("PUT",    r".*/facilities/[^/]+$",                         update_facility)
_router.add("DELETE", r".*/facilities/[^/]+$",                         delete_facility)
```

- [ ] **Step 4: テストが通ることを確認する**

```
cd backend && python -m pytest tests/test_facilities.py -v
```
期待: 全テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add backend/functions/facilities/handler.py backend/tests/test_facilities.py
git commit -m "feat: add hierarchy support and PUT/DELETE to facilities handler"
```

---

## Task 5: documents/handler.py に editor ロールチェックを追加

**Files:**
- Modify: `backend/functions/documents/handler.py`
- Create: `backend/tests/test_documents.py`

- [ ] **Step 1: テストファイルを作成する**

`backend/tests/test_documents.py`:

```python
"""Tests for documents/handler.py — editor role restriction."""
import json
import sys
import os

# パスを絶対パスで解決する
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "layers", "common", "python"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "functions", "documents"))

import boto3
from moto import mock_aws

TABLE_NAME = "test-table"
BUCKET_NAME = "test-bucket"


def _make_event(method: str, path: str, body: dict = None, groups: str = "['user']", sub: str = "user-sub") -> dict:
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": sub,
                        "email": "user@example.com",
                        "cognito:groups": groups,
                    }
                }
            },
        },
        "body": json.dumps(body) if body else None,
        "queryStringParameters": None,
    }


@mock_aws
def test_create_folder_blocked_for_user():
    """user ロールはフォルダ作成不可（403）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["BUCKET_NAME"] = BUCKET_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_event("POST", "/documents/folders", {"name": "新フォルダ"}, groups="['user']")
    result = handler.create_folder(event)
    assert result["statusCode"] == 403


@mock_aws
def test_create_folder_allowed_for_editor():
    """editor ロールはフォルダ作成可能（201）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["BUCKET_NAME"] = BUCKET_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_event("POST", "/documents/folders", {"name": "新フォルダ"}, groups="['editor']")
    result = handler.create_folder(event)
    assert result["statusCode"] == 201


@mock_aws
def test_create_folder_allowed_for_admin():
    """admin ロールはフォルダ作成可能（201）"""
    os.environ["TABLE_NAME"] = TABLE_NAME
    os.environ["BUCKET_NAME"] = BUCKET_NAME
    dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )

    import importlib
    import handler
    importlib.reload(handler)

    event = _make_event("POST", "/documents/folders", {"name": "新フォルダ"}, groups="['admin']")
    result = handler.create_folder(event)
    assert result["statusCode"] == 201
```

- [ ] **Step 2: テストが失敗することを確認する**

```
cd backend && python -m pytest tests/test_documents.py::test_create_folder_blocked_for_user -v
```
期待: FAIL（現状では user でも 201 が返る）

- [ ] **Step 3: `documents/handler.py` を実装する**

`create_folder` 関数の先頭に権限チェックを追加:
```python
def create_folder(event: dict) -> dict:
    deny = auth.require_editor_or_above(event)
    if deny:
        return deny
    user_id = auth.get_user_id(event)
    # ... 以降は既存コードのまま
```

`get_upload_url` 関数の先頭に権限チェックを追加:
```python
def get_upload_url(event: dict) -> dict:
    deny = auth.require_editor_or_above(event)
    if deny:
        return deny
    user_id = auth.get_user_id(event)
    # ... 以降は既存コードのまま
```

- [ ] **Step 4: テストが通ることを確認する**

```
cd backend && python -m pytest tests/test_documents.py -v
```
期待: 全テスト PASS

- [ ] **Step 5: 全バックエンドテストを実行する**

```
cd backend && python -m pytest tests/ -v
```
期待: 全テスト PASS

- [ ] **Step 6: コミットする**

```bash
git add backend/functions/documents/handler.py backend/tests/test_documents.py
git commit -m "feat: restrict document write operations to editor and above"
```

---

## Task 6: サイドバーをアイコン+テキスト常設表示に変更

**Files:**
- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: `globals.css` のサイドバー変数と CSS を更新する**

`globals.css` の `--sidebar-w: 52px;`（26行目）を変更:
```css
  --sidebar-w: 200px;
```

`.sidebar`（109-112行目）を変更:
```css
.sidebar {
  width: var(--sidebar-w); background: var(--color-sidebar); border-right: 1px solid var(--color-sidebar-border);
  display: flex; flex-direction: column; padding: 0.5rem 0; overflow-y: auto; flex-shrink: 0;
}
```

`.sidebar-icon`（113-119行目）を削除し、以下の `.sidebar-item` スタイルに置き換える:
```css
.sidebar-item {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.65rem 1rem; cursor: pointer;
  color: #94a3b8; font-size: 0.85rem; font-weight: 500;
  border-radius: 6px; margin: 0 0.5rem;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.sidebar-item svg { flex-shrink: 0; width: 18px; height: 18px; }
.sidebar-item:hover { background: var(--color-sidebar-hover); color: #e2e8f0; }
.sidebar-item.active { background: var(--color-sidebar-active-bg); color: var(--color-sidebar-active); }
```

`.sidebar-icon[title]:hover::after`（tooltip CSS, 122-126行目）を削除（テキストが表示されるため不要）。

topbar の logo 幅も合わせて調整（80行目）:
```css
  width: var(--sidebar-w); display: flex; align-items: center; justify-content: center; padding: 0 1rem; flex-shrink: 0;
```

- [ ] **Step 2: `Sidebar.jsx` を書き換える**

```jsx
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  {
    path: '/',
    title: 'ダッシュボード',
    id: 'dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    path: '/schedule',
    title: 'スケジュール',
    id: 'schedule',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    path: '/facility',
    title: '施設予約',
    id: 'facility',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    path: '/documents',
    title: 'ドキュメント',
    id: 'documents',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
  },
];

const ADMIN_ITEM = {
  path: '/admin',
  title: '管理設定',
  id: 'admin',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
};

export default function Sidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="sidebar">
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          {item.icon}
          {item.title}
        </div>
      ))}
      <div className="sidebar-spacer" />
      {user?.role === 'admin' && (
        <div
          className={`sidebar-item ${isActive(ADMIN_ITEM.path) ? 'active' : ''}`}
          onClick={() => navigate(ADMIN_ITEM.path)}
        >
          {ADMIN_ITEM.icon}
          {ADMIN_ITEM.title}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: ブラウザで見た目を確認する**

```
cd frontend && npm run dev
```
サイドバーが200px幅でアイコン+テキスト表示になっていることを確認。

- [ ] **Step 4: コミットする**

```bash
git add frontend/src/styles/globals.css frontend/src/components/Sidebar.jsx
git commit -m "feat: redesign sidebar with icon+text permanent layout"
```

---

## Task 7: 施設 CRUD API クライアントを追加

**Files:**
- Modify: `frontend/src/lib/api/facilities.js`
- Modify: `frontend/src/lib/api/index.js`

- [ ] **Step 1: `facilities.js` に CRUD 関数を追加する**

```javascript
import { api } from './client.js';

export function getFacilities() {
  return api('GET', '/facilities');
}

export function createFacility(data) {
  return api('POST', '/facilities', data);
}

export function updateFacility(facilityId, data) {
  return api('PUT', `/facilities/${facilityId}`, data);
}

export function deleteFacility(facilityId) {
  return api('DELETE', `/facilities/${facilityId}`);
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

- [ ] **Step 2: `index.js` の re-export を更新する**

```javascript
export { api, ApiError, setAuthToken, clearAuthToken, setUnauthorizedHandler } from './client.js';
export { getSchedules, createSchedule, updateSchedule, deleteSchedule } from './schedules.js';
export { getFacilities, createFacility, updateFacility, deleteFacility, getReservations, createReservation, deleteReservation } from './facilities.js';
export { getFolders, createFolder, deleteFolder, getFiles, getUploadUrl, getDownloadUrl, deleteFile } from './documents.js';
export { getUsers, getUser, createUser, updateUser, deleteUser } from './users.js';
```

- [ ] **Step 3: コミットする**

```bash
git add frontend/src/lib/api/facilities.js frontend/src/lib/api/index.js
git commit -m "feat: add facility CRUD API client functions"
```

---

## Task 8: 管理設定ページ（Admin.jsx）を作成する

**Files:**
- Create: `frontend/src/pages/Admin.jsx`

- [ ] **Step 1: `Admin.jsx` を作成する**

```jsx
import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../lib/api';
import { getFacilities, createFacility, updateFacility, deleteFacility } from '../lib/api';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';

// ---------- ユーザーマスタタブ ----------

function UsersTab() {
  const showToast = useToast();
  const [users, setUsers] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function load() {
    try {
      const data = await getUsers();
      setUsers(data.users || []);
    } catch {
      setUsers([]);
      showToast('ユーザーの取得に失敗しました', 'error');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvite(fd) {
    if (!fd.email?.trim()) throw 'メールアドレスを入力してください';
    if (!fd.name?.trim()) throw '表示名を入力してください';
    await createUser({ email: fd.email.trim(), name: fd.name.trim(), role: fd.role || 'user' });
    showToast('招待メールを送信しました', 'success');
    setInviteOpen(false);
    load();
  }

  async function handleRoleChange(userId, newRole) {
    try {
      await updateUser(userId, { role: newRole });
      showToast('ロールを変更しました', 'success');
      load();
    } catch {
      showToast('ロール変更に失敗しました', 'error');
    }
  }

  async function handleToggleEnabled(userId, currentEnabled) {
    try {
      await updateUser(userId, { enabled: !currentEnabled });
      showToast(currentEnabled ? 'アカウントを無効化しました' : 'アカウントを有効化しました', 'success');
      load();
    } catch {
      showToast('操作に失敗しました', 'error');
    }
  }

  async function handleDelete(userId, name) {
    if (!confirm(`${name} を削除しますか？この操作は取り消せません。`)) return;
    try {
      await deleteUser(userId);
      showToast('ユーザーを削除しました', 'success');
      load();
    } catch {
      showToast('削除に失敗しました', 'error');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>+ ユーザー招待</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>名前</th><th>メール</th><th>ロール</th><th>状態</th><th>操作</th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={5}><div className="skeleton skeleton-row" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>ユーザーなし</td></tr>
            ) : users.map(u => (
              <tr key={u.userId}>
                <td>{u.name}</td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.userId, e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: 4 }}
                  >
                    <option value="user">user</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.enabled ? 'badge-green' : 'badge-gray'}`}>
                    {u.enabled ? '有効' : '無効'}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleToggleEnabled(u.userId, u.enabled)}
                  >
                    {u.enabled ? '無効化' : '有効化'}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(u.userId, u.name)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={inviteOpen} title="ユーザーを招待" onClose={() => setInviteOpen(false)} onSubmit={handleInvite}>
        <div className="field">
          <label>メールアドレス <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="email" name="email" placeholder="user@example.com" />
        </div>
        <div className="field">
          <label>表示名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" placeholder="山田 太郎" />
        </div>
        <div className="field">
          <label>ロール</label>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            {['user', 'editor', 'admin'].map(r => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="radio" name="role" value={r} defaultChecked={r === 'user'} /> {r}
              </label>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// ---------- 施設マスタタブ ----------

function FacilitiesTab() {
  const showToast = useToast();
  const [facilities, setFacilities] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  async function load() {
    try {
      const data = await getFacilities();
      setFacilities(data.facilities || []);
    } catch {
      setFacilities([]);
      showToast('施設情報の取得に失敗しました', 'error');
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditTarget(null); setDrawerOpen(true); }
  function openEdit(f) { setEditTarget(f); setDrawerOpen(true); }

  async function handleSubmit(fd) {
    if (!fd.name?.trim()) throw '施設名を入力してください';
    if (editTarget) {
      // PUT は name/description/capacity/location のみ（facilityType/parentId は変更不可）
      const payload = {
        name: fd.name.trim(),
        description: fd.description || '',
        capacity: fd.capacity ? parseInt(fd.capacity) : 1,
        location: fd.location || '',
      };
      await updateFacility(editTarget.facilityId, payload);
      showToast('施設を更新しました', 'success');
    } else {
      const payload = {
        name: fd.name.trim(),
        description: fd.description || '',
        capacity: fd.capacity ? parseInt(fd.capacity) : 1,
        location: fd.location || '',
        facilityType: fd.facilityType || 'facility',
        parentId: fd.parentId || 'ROOT',
      };
      await createFacility(payload);
      showToast('施設を作成しました', 'success');
    }
    setDrawerOpen(false);
    load();
  }

  async function handleDelete(f) {
    if (!confirm(`「${f.name}」を削除しますか？`)) return;
    try {
      await deleteFacility(f.facilityId);
      showToast('施設を削除しました', 'success');
      load();
    } catch (err) {
      if (err.status === 409) {
        showToast('子施設または予約が存在するため削除できません', 'error');
      } else {
        showToast('削除に失敗しました', 'error');
      }
    }
  }

  // グループ単位で施設を整理
  const groups = facilities ? facilities.filter(f => f.facilityType === 'group') : [];
  const topLevel = facilities ? facilities.filter(f => f.facilityType !== 'group' && f.parentId === 'ROOT') : [];

  function getChildren(groupId) {
    return facilities ? facilities.filter(f => f.parentId === groupId) : [];
  }

  function FacilityRow({ f, indent = false }) {
    return (
      <tr>
        <td style={{ paddingLeft: indent ? '2rem' : undefined }}>
          {f.facilityType === 'group' ? (
            <strong>{f.name}</strong>
          ) : f.name}
        </td>
        <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{f.location || '-'}</td>
        <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{f.capacity}名</td>
        <td>
          <span className={`badge ${f.facilityType === 'group' ? 'badge-orange' : 'badge-blue'}`}>
            {f.facilityType === 'group' ? 'グループ' : '施設'}
          </span>
        </td>
        <td style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="btn btn-sm" onClick={() => openEdit(f)}>編集</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(f)}>削除</button>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={openCreate}>+ 施設追加</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>名前</th><th>場所</th><th>収容</th><th>種別</th><th>操作</th></tr>
          </thead>
          <tbody>
            {facilities === null ? (
              <tr><td colSpan={5}><div className="skeleton skeleton-row" /></td></tr>
            ) : facilities.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>施設なし</td></tr>
            ) : (
              <>
                {groups.map(g => (
                  <>
                    <FacilityRow key={g.facilityId} f={g} />
                    {getChildren(g.facilityId).map(child => (
                      <FacilityRow key={child.facilityId} f={child} indent />
                    ))}
                  </>
                ))}
                {topLevel.map(f => <FacilityRow key={f.facilityId} f={f} />)}
              </>
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        isOpen={drawerOpen}
        title={editTarget ? '施設を編集' : '施設を追加'}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label>施設名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" defaultValue={editTarget?.name || ''} placeholder="例：第1会議室" />
        </div>
        <div className="field">
          <label>種別</label>
          <select name="facilityType" defaultValue={editTarget?.facilityType || 'facility'}>
            <option value="facility">施設（予約可能）</option>
            <option value="group">グループ（分類用）</option>
          </select>
        </div>
        <div className="field">
          <label>親グループ</label>
          <select name="parentId" defaultValue={editTarget?.parentId || 'ROOT'}>
            <option value="ROOT">なし（トップレベル）</option>
            {groups.map(g => (
              <option key={g.facilityId} value={g.facilityId}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>収容人数</label>
          <input type="number" name="capacity" min="1" defaultValue={editTarget?.capacity || 1} />
        </div>
        <div className="field">
          <label>場所</label>
          <input type="text" name="location" defaultValue={editTarget?.location || ''} placeholder="例：3F 東棟" />
        </div>
        <div className="field">
          <label>説明</label>
          <textarea name="description" defaultValue={editTarget?.description || ''} placeholder="任意の説明..." />
        </div>
      </Drawer>
    </div>
  );
}

// ---------- 管理設定ページ本体 ----------

const TABS = [
  { id: 'users', label: 'ユーザーマスタ' },
  { id: 'facilities', label: '施設マスタ' },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>管理設定</h2>
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.6rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.9rem',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'users' ? <UsersTab /> : <FacilitiesTab />}
    </div>
  );
}
```

- [ ] **Step 2: ブラウザで動作確認する**

```
cd frontend && npm run dev
```
`/admin` にアクセスし、タブ切り替え・ユーザー一覧・施設一覧が表示されることを確認（バックエンドはスタブでも可）。

- [ ] **Step 3: コミットする**

```bash
git add frontend/src/pages/Admin.jsx
git commit -m "feat: add Admin management page with user and facility master tabs"
```

---

## Task 9: App.jsx に /admin ルートを追加し /users をリダイレクト

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: `App.jsx` を更新する**

```jsx
import { HashRouter as BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Facility from './pages/Facility';
import Documents from './pages/Documents';
import Admin from './pages/Admin';

function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Login />;

  return (
    <div id="app" style={{ display: 'flex' }}>
      <div className="topbar-wrapper" style={{ position:'fixed', top:0, left:0, right:0, zIndex:50 }}>
        <TopBar />
      </div>
      <div className="app-body" style={{ marginTop: 'var(--topbar-h)', width:'100%', display:'flex', height:'calc(100vh - var(--topbar-h))' }}>
        <Sidebar />
        <main className="main-content">
          <div className="main-inner">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/facility" element={<Facility />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/admin" element={user?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
              <Route path="/users" element={<Navigate to="/admin" />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppLayout />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: `Users.jsx` を削除する**

`Users.jsx` の機能は `Admin.jsx` に移管済みのため、ファイルを削除する:

```bash
rm frontend/src/pages/Users.jsx
```

- [ ] **Step 3: `/users` へのアクセスが `/admin` にリダイレクトされることを確認する**

ブラウザで `/#/users` にアクセスし、`/#/admin` にリダイレクトされることを確認。

- [ ] **Step 4: コミットする**

```bash
git add frontend/src/App.jsx
git rm frontend/src/pages/Users.jsx
git commit -m "feat: add /admin route and redirect /users to /admin"
```

---

## Task 10: ドキュメント更新

**Files:**
- Modify: `docs/db-definition.md`
- Modify: `docs/api-spec.md`

- [ ] **Step 1: `db-definition.md` を更新する**

`role` フィールドの説明（63行目）を変更:
```
| role | String | ○ | ロール（admin/editor/user） | user |
```

施設属性定義（103行目付近）に `parentId`, `facilityType` 行を追加:
```
| parentId | String | - | 親グループのfacilityId（ルートはROOT） | ROOT |
| facilityType | String | - | 施設種別（group/facility） | facility |
```

- [ ] **Step 2: `api-spec.md` を更新する**

`POST /users` リクエストボディの `role` 説明を更新:
```
| role | string | - | ロール（admin/editor/user、デフォルト: user） |
```

施設 API セクションに `PUT /facilities/{facilityId}` と `DELETE /facilities/{facilityId}` を追加。

- [ ] **Step 3: コミットする**

```bash
git add docs/db-definition.md docs/api-spec.md
git commit -m "docs: update db-definition and api-spec for editor role and facility hierarchy"
```

---

## 最終確認

- [ ] **全バックエンドテストを実行する**

```
cd backend && python -m pytest tests/ -v --tb=short
```
期待: 全テスト PASS

- [ ] **フロントエンドビルドが通ることを確認する**

```
cd frontend && npm run build
```
期待: エラーなし

- [ ] **最終コミット**

```bash
git add .
git commit -m "feat: complete master data and permission management implementation"
```
