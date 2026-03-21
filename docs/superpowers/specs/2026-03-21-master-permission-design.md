# 施設マスタ・ユーザーマスタ・権限管理 設計書

**作成日**: 2026-03-21
**ステータス**: 承認済み

---

## 概要

現行の `admin / user` 2ロール体制を `admin / editor / user` 3ロールに拡張し、施設マスタとユーザーマスタの管理UIを新設する。また、施設に2階層構造（グループ/実体）を追加し、サイドバーをアイコン+テキスト常設表示に改修する。

---

## 1. ロール設計

### ロール定義

| ロール | 説明 |
|--------|------|
| `admin` | 全操作可能。ユーザー管理・施設マスタ管理・他人のスケジュール編集・削除も可能 |
| `editor` | 文書の作成・編集・削除が可能。施設予約・スケジュール（自分のみ）も可能 |
| `user` | 文書は閲覧のみ。施設予約・スケジュール（自分のみ）は可能 |

### 機能別権限マトリクス

| 機能 | admin | editor | user |
|------|:-----:|:------:|:----:|
| ユーザーマスタ（CRUD・有効/無効） | o | - | - |
| 施設マスタ（CRUD） | o | - | - |
| 施設予約（作成・削除） | o | o | o |
| スケジュール（自分の作成・編集・削除） | o | o | o |
| スケジュール（他人分 編集・削除） | o | - | - |
| 文書: 閲覧 | o | o | o |
| 文書: 作成・編集・削除 | o | o | - |

**注意**: 現行の `user` ロールはフォルダ作成・ファイルアップロードが可能だが、今回の変更でこれらは `editor` 以上に制限される。これは既存 `user` ロールへの破壊的変更であり、既存ユーザーへの周知が必要。

### Cognitoグループ戦略

現行の権限チェック（`auth.py`）は `cognito:groups` クレームを使用している（`custom:role` 属性ではない）。`editor` ロールを追加するため以下の対応を行う：

1. **Cognitoユーザープールに `editor` グループを新規作成**（`template.yaml` の `CognitoUserPoolGroup` リソースを追加）
2. **`auth.py` に `is_editor()` ヘルパーを追加**（`cognito:groups` に `editor` が含まれるか判定）
3. **`create_user` / `update_user` 処理**で `admin_add_user_to_group` / `admin_remove_user_from_group` の呼び出しを `editor` グループにも対応させる
4. **ロール変更時（`PUT /users/{userId}`）** は Cognito グループのメンバーシップも同時に更新する（属性更新だけでは権限が反映されない）

### DB変更

`role` フィールドの許容値を `admin/user` から `admin/editor/user` に拡張する。スキーマ変更なし（DynamoDBのため許容値はアプリケーション層で管理）。

---

## 2. 施設階層設計

### 2階層構造

施設は「グループ（親）」と「予約可能施設（子）」の2階層を持つ。

```
グループ（親）            予約可能施設（子）
-----------------        -----------------------
本社ビル             ->  第1会議室、第2会議室
備品                 ->  プロジェクターA、ホワイトボード
社用車               ->  プリウス、ハイエース
```

- 予約できるのは子施設（`facilityType: "facility"`）のみ
- 親施設（`facilityType: "group"`）は表示グループとしてのみ機能
- `parentId: "ROOT"` の施設はフラット扱い（グループなし）
- 既存施設はすべて `parentId: "ROOT"`, `facilityType: "facility"` として扱う（後方互換）
- `parentId` および `facilityType` はレスポンスに常に含める（既存施設は `ROOT` / `facility` を返す）

### DynamoDB属性追加

既存の施設スキーマ（`FACILITY#{facilityId} / #METADATA`）に以下を追加：

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| `parentId` | String | - | 親施設のfacilityId。なければ `ROOT` | `ROOT` または `uuid-...` |
| `facilityType` | String | - | `group`（親）または `facility`（子・予約可能） | `facility` |

### API変更

#### GET /facilities（既存、レスポンス拡張）

レスポンスの `facilities[]` に `parentId`, `facilityType` を追加。`_item_to_facility()` 関数を更新する。

#### POST /facilities（既存、リクエスト拡張）

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `parentId` | string | - | 親グループのfacilityId（省略時: `ROOT`） |
| `facilityType` | string | - | `group` または `facility`（省略時: `facility`） |

#### PUT /facilities/{facilityId}（新規、adminのみ）

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `name` | string | - | 施設名（最大200文字） |
| `description` | string | - | 説明（最大1000文字） |
| `capacity` | number | - | 収容人数 |
| `location` | string | - | 場所（最大500文字） |

`parentId` および `facilityType` は作成後の変更不可（データ整合性のため）。

#### DELETE /facilities/{facilityId}（新規、adminのみ）

| HTTPステータス | エラーコード | 発生条件 |
|-------------|------------|--------|
| 409 | CONFLICT | 子施設が存在する（`facilityType: "group"` の場合） |
| 409 | CONFLICT | 当該施設に予約が存在する |

#### 既存の予約系APIは変更なし

---

## 3. ユーザーマスタ設計

### 追加操作

現行（一覧表示・招待のみ）に以下を追加：

| 操作 | 説明 | 実装方法 |
|------|------|---------|
| ロール変更 | `admin/editor/user` を後から変更 | `PUT /users/{userId}` 拡張。`custom:role` 属性更新 + Cognitoグループメンバーシップ更新（古いグループから削除、新しいグループに追加）を両方実行 |
| 有効/無効化 | アカウントの一時停止・復帰 | `PUT /users/{userId}` の `enabled` フラグを判定し、`admin_enable_user` または `admin_disable_user` を呼び出す（属性更新とは別のCognito API） |
| 削除 | Cognitoからユーザー削除 | `DELETE /users/{userId}` 既存API使用 |

---

## 4. UI設計

### サイドバー改修

現行のアイコンのみ表示から、アイコン+テキストの常設サイドバーに変更。ハンバーガーメニューは使用しない。アイコンは既存のSVGアイコンをそのまま使用（絵文字は使用しない）。

```
+------------------+
|  Groupware       |
+------------------+
| [icon] ダッシュボード |
| [icon] スケジュール   |
| [icon] 施設予約       |
| [icon] ドキュメント   |
| [icon] 管理設定       |  <- adminのみ表示
+------------------+
| [icon] ユーザー名     |
+------------------+
```

- サイドバー幅を現行より広げる（アイコンのみ: ~56px -> テキスト付き: ~200px）
- メインコンテンツ領域の左マージンを調整

### 管理設定ページ（`/admin`）

adminのみアクセス可能な新規ページ。タブ切り替えで2つのマスタを管理。

**ユーザーマスタタブ**
- 既存の招待機能をこのページに移動（`Users.jsx` の招待ドロワーを `Admin.jsx` へ移管）
- 一覧: 名前・メール・ロール・ステータス
- 各行に「ロール変更」「有効/無効」「削除」ボタン

**施設マスタタブ**
- 親グループ単位で折りたたみ表示
- 「グループ追加」「施設追加」ボタン
- 各行に「編集」「削除」ボタン
- 削除時: 子施設が存在するグループは削除不可（409）、予約が存在する施設は削除不可（409）

### `/users` ルートの扱い

`Users.jsx` の招待・管理機能を `Admin.jsx` に移管した後、`/users` ルートは廃止し `/admin` にリダイレクトする。

---

## 5. 変更ファイル一覧（概算）

### バックエンド

| ファイル | 変更内容 |
|---------|---------|
| `backend/layers/common/python/auth.py` | `is_editor()` ヘルパー追加 |
| `backend/functions/users/handler.py` | `editor` ロール対応、有効/無効化（Cognito API呼び出し追加）、ロール変更時のグループメンバーシップ同期 |
| `backend/functions/facilities/handler.py` | PUT/DELETE追加、`_item_to_facility()` に `parentId`/`facilityType` 追加、階層対応 |
| `backend/functions/documents/handler.py` | フォルダ作成・ファイルアップロードに `editor` 以上のロールチェック追加（`user` への破壊的変更） |
| `template.yaml` | 施設PUT/DELETEルート追加、`editor` Cognitoグループリソース追加、`UsersFunction` IAMポリシーに `AdminEnableUser` / `AdminDisableUser` アクション追加 |

### フロントエンド

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/Sidebar.jsx` | アイコン+テキスト常設化 |
| `frontend/src/pages/Admin.jsx` | 新規作成（管理設定ページ） |
| `frontend/src/pages/Facility.jsx` | 階層表示対応 |
| `frontend/src/pages/Users.jsx` | 機能を Admin.jsx に移管後、ファイル削除 |
| `frontend/src/App.jsx` | `/admin` ルート追加、adminガード、`/users` -> `/admin` リダイレクト追加 |
| `frontend/src/lib/api.js` | 施設CRUD API追加 |

### ドキュメント

| ファイル | 変更内容 |
|---------|---------|
| `docs/db-definition.md` | `role` フィールドの説明を `admin/editor/user` に更新、施設スキーマに `parentId`/`facilityType` 行を追加 |
| `docs/api-spec.md` | 施設PUT/DELETE追加、ユーザーPUT拡張を反映 |

---

## 6. 非機能要件・制約

- 既存の施設・予約データは変更不要（`parentId/facilityType` は任意属性として後方互換）
- 既存の `admin/user` ロールユーザーはそのまま動作継続（`user` は文書書き込み不可になる点は除く）
- 管理ページへの直接URLアクセスはフロントエンドでガード（`admin` 以外は `/` にリダイレクト）
- バックエンドの権限チェックは `cognito:groups` クレームを使用（既存パターン踏襲）
- ロールバック: `editor` グループを削除した場合、`editor` ロールのユーザーは `user` 相当の権限になる（グループなし = `user` 扱い）
