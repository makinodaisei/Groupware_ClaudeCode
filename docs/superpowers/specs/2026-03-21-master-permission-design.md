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

### DynamoDB属性追加

既存の施設スキーマ（`FACILITY#{facilityId} / #METADATA`）に以下を追加：

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| `parentId` | String | - | 親施設のfacilityId。なければ `ROOT` | `ROOT` または `uuid-...` |
| `facilityType` | String | - | `group`（親）または `facility`（子・予約可能） | `facility` |

### API変更

- `GET /facilities` レスポンスに `parentId`, `facilityType` を追加
- `POST /facilities` リクエストに `parentId`, `facilityType` を追加（任意）
- `PUT /facilities/{facilityId}` 新規追加（施設情報更新）
- `DELETE /facilities/{facilityId}` 新規追加（施設削除、adminのみ）
- 既存の予約系APIは変更なし

---

## 3. ユーザーマスタ設計

### 追加操作

現行（一覧表示・招待のみ）に以下を追加：

| 操作 | 説明 | 実装方法 |
|------|------|---------|
| ロール変更 | `admin/editor/user` を後から変更 | `PUT /users/{userId}` 既存API拡張（`editor` 対応追加） |
| 有効/無効化 | アカウントの一時停止・復帰 | `PUT /users/{userId}` に `enabled` フラグ追加 |
| 削除 | Cognitoからユーザー削除 | `DELETE /users/{userId}` 既存API使用 |

---

## 4. UI設計

### サイドバー改修

現行のアイコンのみ表示から、アイコン+テキストの常設サイドバーに変更。ハンバーガーメニューは使用しない。

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
- 既存の招待機能をこのページに移動
- 一覧: 名前・メール・ロール・ステータス
- 各行に「ロール変更」「有効/無効」「削除」ボタン

**施設マスタタブ**
- 親グループ単位で折りたたみ表示
- 「グループ追加」「施設追加」ボタン
- 各行に「編集」「削除」ボタン
- 削除時: 子施設が存在する親は削除不可、予約が存在する施設は削除不可

---

## 5. 変更ファイル一覧（概算）

### バックエンド

| ファイル | 変更内容 |
|---------|---------|
| `backend/functions/users/handler.py` | `editor` ロール対応、有効/無効化追加 |
| `backend/functions/facilities/handler.py` | PUT/DELETE追加、階層対応 |
| `backend/functions/documents/handler.py` | `editor` ロールチェック追加 |
| `template.yaml` | 新規Lambda/APIルート追加 |

### フロントエンド

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/Sidebar.jsx` | アイコン+テキスト常設化 |
| `frontend/src/pages/Admin.jsx` | 新規作成（管理設定ページ） |
| `frontend/src/pages/Facility.jsx` | 階層表示対応 |
| `frontend/src/pages/Users.jsx` | 既存機能を Admin.jsx に移動 |
| `frontend/src/App.jsx` | `/admin` ルート追加、adminガード |
| `frontend/src/lib/api.js` | 施設CRUD API追加 |

---

## 6. 非機能要件・制約

- 既存の施設・予約データは変更不要（`parentId/facilityType` は任意属性として後方互換）
- 既存の `admin/user` ロールユーザーはそのまま動作継続
- 管理ページへの直接URLアクセスはフロントエンドでガード（`admin` 以外は `/` にリダイレクト）
- バックエンドの権限チェックは既存パターン（`claims["custom:role"]`）を踏襲
