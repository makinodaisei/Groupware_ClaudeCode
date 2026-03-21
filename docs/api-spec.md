---
sheet_name: API仕様書
output_xlsx: artifacts/api-spec.xlsx
source: backend/functions/*/handler.py, template.yaml
version: 1.0.0
last_updated: 2026-03-08
base_url: https://{api-id}.execute-api.ap-northeast-1.amazonaws.com/{env}
auth: Bearer {CognitoIdToken}
---

# API仕様書

## 共通仕様

| 項目 | 内容 |
|------|------|
| ベースURL | https://{api-id}.execute-api.ap-northeast-1.amazonaws.com/{env} |
| 認証方式 | Cognito JWT (IdToken) - Authorization: Bearer {token} |
| Content-Type | application/json |
| 文字コード | UTF-8 |
| タイムアウト | 29秒 |
| CORSオリジン | * （すべてのオリジンを許可） |

## 共通レスポンス形式

| 項目 | 内容 |
|------|------|
| 成功時 | HTTPステータス 200/201/204 + JSONボディ |
| エラー時 | HTTPステータス 4xx/5xx + {"error": "CODE", "message": "説明"} |

## 共通エラーコード

| HTTP Status | error コード | 発生条件 |
|------------|------------|--------|
| 400 | BAD_REQUEST | リクエストパラメータ・ボディ不正 |
| 401 | UNAUTHORIZED | 認証トークン未指定・期限切れ |
| 403 | FORBIDDEN | 権限不足（adminのみの操作を一般ユーザーが実行） |
| 404 | NOT_FOUND | リソースが存在しない |
| 409 | CONFLICT | 重複（メール重複・施設重複予約） |
| 500 | INTERNAL_SERVER_ERROR | サーバー内部エラー |

---

## Users API (/users)

### GET /users

| 項目 | 内容 |
|------|------|
| 説明 | ユーザー一覧取得 |
| 認証 | 必須 |
| 権限 | admin のみ |

#### クエリパラメータ (GET /users)

| パラメータ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| limit | number | - | 取得件数（デフォルト60） |
| token | string | - | ページネーショントークン |

#### レスポンスフィールド (GET /users 200 OK)

| フィールド | 型 | 説明 |
|----------|-----|------|
| users | array | ユーザーオブジェクト配列 |
| nextToken | string | 次ページトークン（最終ページはnull） |
| users[].userId | string | Cognito Sub（UUID） |
| users[].email | string | メールアドレス |
| users[].name | string | 表示名 |
| users[].role | string | ロール（admin/editor/user） |
| users[].status | string | Cognitoユーザーステータス |
| users[].enabled | boolean | アカウント有効フラグ |
| users[].createdAt | string | 作成日時 |

### GET /users/{userId}

| 項目 | 内容 |
|------|------|
| 説明 | ユーザー詳細取得 |
| 認証 | 必須 |
| 権限 | admin または本人のみ |

#### パスパラメータ (GET /users/{userId})

| パラメータ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| userId | string | ○ | Cognito Username（email） |

### POST /users

| 項目 | 内容 |
|------|------|
| 説明 | ユーザー作成（管理者が招待メールを送信） |
| 認証 | 必須 |
| 権限 | admin のみ |

#### リクエストボディ (POST /users)

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| email | string | ○ | メールアドレス |
| name | string | ○ | 表示名 |
| role | string | - | ロール（admin/editor/user、デフォルト: user） |

### PUT /users/{userId}

| 項目 | 内容 |
|------|------|
| 説明 | ユーザー情報更新 |
| 認証 | 必須 |
| 権限 | admin または本人のみ（role変更はadminのみ） |

#### リクエストボディ (PUT /users/{userId})

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| name | string | - | 表示名 |
| role | string | - | ロール（admin/editor/user、adminのみ変更可） |
| enabled | boolean | - | アカウント有効フラグ（adminのみ変更可） |

### DELETE /users/{userId}

| 項目 | 内容 |
|------|------|
| 説明 | ユーザー削除 |
| 認証 | 必須 |
| 権限 | admin のみ（自分自身は削除不可） |

---

## Schedules API (/schedules)

### GET /schedules

| 項目 | 内容 |
|------|------|
| 説明 | スケジュール一覧取得（月次または週次） |
| 認証 | 必須 |
| 権限 | user, admin |

#### クエリパラメータ (GET /schedules)

| パラメータ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| month | string | △ | YYYY-MM形式（月次表示） |
| start | string | △ | ISO-8601開始日時（週次表示） |
| end | string | △ | ISO-8601終了日時（週次表示） |

※ month または start+end のいずれかを指定すること

#### レスポンスフィールド (GET /schedules 200 OK)

| フィールド | 型 | 説明 |
|----------|-----|------|
| events | array | イベントオブジェクト配列 |
| count | number | 件数 |
| events[].eventId | string | イベントID |
| events[].title | string | タイトル |
| events[].description | string | 説明 |
| events[].startDatetime | string | 開始日時（ISO-8601） |
| events[].endDatetime | string | 終了日時（ISO-8601） |
| events[].allDay | boolean | 終日フラグ |
| events[].location | string | 場所 |
| events[].isPublic | boolean | 公開フラグ |
| events[].createdBy | string | 作成者userId |

### POST /schedules

| 項目 | 内容 |
|------|------|
| 説明 | スケジュール作成 |
| 認証 | 必須 |
| 権限 | user, admin |

#### リクエストボディ (POST /schedules)

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| title | string | ○ | タイトル（最大200文字） |
| startDatetime | string | ○ | 開始日時（ISO-8601） |
| endDatetime | string | ○ | 終了日時（ISO-8601） |
| description | string | - | 説明（最大2000文字） |
| allDay | boolean | - | 終日フラグ（デフォルト: false） |
| location | string | - | 場所（最大500文字） |
| isPublic | boolean | - | 公開フラグ（デフォルト: true） |

### GET /schedules/{eventId}

| 項目 | 内容 |
|------|------|
| 説明 | スケジュール詳細取得 |
| 認証 | 必須 |
| 権限 | 公開イベントは全員、非公開は作成者・adminのみ |

### PUT /schedules/{eventId}

| 項目 | 内容 |
|------|------|
| 説明 | スケジュール更新 |
| 認証 | 必須 |
| 権限 | 作成者または admin |

### DELETE /schedules/{eventId}

| 項目 | 内容 |
|------|------|
| 説明 | スケジュール削除 |
| 認証 | 必須 |
| 権限 | 作成者または admin |

---

## Facilities API (/facilities)

### GET /facilities

| 項目 | 内容 |
|------|------|
| 説明 | 施設一覧取得 |
| 認証 | 必須 |
| 権限 | user, admin |

#### レスポンスフィールド (GET /facilities 200 OK)

| フィールド | 型 | 説明 |
|----------|-----|------|
| facilities | array | 施設オブジェクト配列 |
| facilities[].facilityId | string | 施設ID |
| facilities[].name | string | 施設名 |
| facilities[].description | string | 説明 |
| facilities[].capacity | number | 収容人数 |
| facilities[].location | string | 場所 |

### POST /facilities

| 項目 | 内容 |
|------|------|
| 説明 | 施設作成 |
| 認証 | 必須 |
| 権限 | admin のみ |

#### リクエストボディ (POST /facilities)

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| name | string | ○ | 施設名（最大200文字） |
| description | string | - | 説明（最大1000文字） |
| capacity | number | - | 収容人数（デフォルト: 1） |
| location | string | - | 場所（最大500文字） |

### PUT /facilities/{facilityId}

| 項目 | 内容 |
|------|------|
| 説明 | 施設情報更新 |
| 認証 | 必須 |
| 権限 | admin のみ |

#### リクエストボディ (PUT /facilities/{facilityId})

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| name | string | - | 施設名（最大200文字） |
| description | string | - | 説明（最大1000文字） |
| capacity | number | - | 収容人数 |
| location | string | - | 場所（最大500文字） |

※ `parentId` および `facilityType` は作成後変更不可（イミュータブル）

#### レスポンス (PUT /facilities/{facilityId} 200 OK)

更新後の施設オブジェクトを返す。

### DELETE /facilities/{facilityId}

| 項目 | 内容 |
|------|------|
| 説明 | 施設削除 |
| 認証 | 必須 |
| 権限 | admin のみ |
| 成功時 | 204 No Content |

#### エラーレスポンス (DELETE /facilities/{facilityId} 409)

| 条件 | error コード | 説明 |
|------|------------|------|
| 子施設が存在する場合（facilityType: "group"） | CONFLICT | 子施設を先に削除してください |
| 当該施設に予約が存在する場合 | CONFLICT | 予約を先に削除してください |

### GET /facilities/{facilityId}/reservations

| 項目 | 内容 |
|------|------|
| 説明 | 施設の予約一覧取得（施設別または日付別） |
| 認証 | 必須 |
| 権限 | user, admin |

#### クエリパラメータ (GET /facilities/{facilityId}/reservations)

| パラメータ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| date | string | - | YYYY-MM-DD形式（指定時は全施設を横断検索） |

### POST /facilities/{facilityId}/reservations

| 項目 | 内容 |
|------|------|
| 説明 | 施設予約作成（重複予約防止あり） |
| 認証 | 必須 |
| 権限 | user, admin |
| 排他制御 | DynamoDB TransactWriteItems + ConditionExpression |

#### リクエストボディ (POST /facilities/{facilityId}/reservations)

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| title | string | ○ | 予約タイトル（最大200文字） |
| startDatetime | string | ○ | 開始日時（ISO-8601） |
| endDatetime | string | ○ | 終了日時（ISO-8601） |
| attendees | array | - | 参加者userIdリスト |
| notes | string | - | メモ（最大2000文字） |

#### エラーレスポンス (POST /facilities/{facilityId}/reservations 409)

| フィールド | 型 | 説明 |
|----------|-----|------|
| error | string | CONFLICT |
| message | string | 重複している日時の詳細 |

### DELETE /facilities/{facilityId}/reservations/{reservationId}

| 項目 | 内容 |
|------|------|
| 説明 | 予約削除 |
| 認証 | 必須 |
| 権限 | 予約者または admin |

---

## Documents API (/documents)

### GET /documents/folders

| 項目 | 内容 |
|------|------|
| 説明 | フォルダ一覧取得 |
| 認証 | 必須 |
| 権限 | user, admin |

#### クエリパラメータ (GET /documents/folders)

| パラメータ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| parentFolderId | string | - | 親フォルダID（デフォルト: ROOT） |

### POST /documents/folders

| 項目 | 内容 |
|------|------|
| 説明 | フォルダ作成 |
| 認証 | 必須 |
| 権限 | user, admin |

#### リクエストボディ (POST /documents/folders)

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| name | string | ○ | フォルダ名（最大100文字） |
| parentFolderId | string | - | 親フォルダID（デフォルト: ROOT） |
| parentPath | string | - | 親フォルダのパス（デフォルト: /） |

### DELETE /documents/folders/{folderId}

| 項目 | 内容 |
|------|------|
| 説明 | フォルダ削除（ファイルがある場合は削除不可） |
| 認証 | 必須 |
| 権限 | admin のみ |

### GET /documents/folders/{folderId}/files

| 項目 | 内容 |
|------|------|
| 説明 | フォルダ内のファイル一覧取得 |
| 認証 | 必須 |
| 権限 | user, admin |

#### レスポンスフィールド (GET /documents/folders/{folderId}/files 200 OK)

| フィールド | 型 | 説明 |
|----------|-----|------|
| files | array | ファイルオブジェクト配列 |
| count | number | 件数 |
| files[].fileId | string | ファイルID |
| files[].name | string | ファイル名 |
| files[].contentType | string | MIMEタイプ |
| files[].size | number | ファイルサイズ（バイト） |
| files[].status | string | アップロード状態（pending/uploaded） |
| files[].uploadedBy | string | アップロード者userId |

### POST /documents/folders/{folderId}/files/upload-url

| 項目 | 内容 |
|------|------|
| 説明 | ファイルアップロード用 S3 Presigned PUT URL を発行 |
| 認証 | 必須 |
| 権限 | user, admin |
| 補足 | URLはLambdaが発行し、クライアントが直接S3にPUTする（Lambdaはファイルを受け取らない） |

#### リクエストボディ (POST /documents/folders/{folderId}/files/upload-url)

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| name | string | ○ | ファイル名（最大255文字） |
| contentType | string | ○ | MIMEタイプ（例: application/pdf） |
| size | number | - | ファイルサイズ（バイト） |

#### レスポンスフィールド (POST /documents/folders/{folderId}/files/upload-url 201 Created)

| フィールド | 型 | 説明 |
|----------|-----|------|
| fileId | string | 発行されたファイルID |
| uploadUrl | string | S3 Presigned PUT URL（有効期限15分） |
| expiresIn | number | 有効期限（秒） |
| s3Key | string | S3オブジェクトキー |

### GET /documents/folders/{folderId}/files/{fileId}/download-url

| 項目 | 内容 |
|------|------|
| 説明 | ファイルダウンロード用 S3 Presigned GET URL を発行 |
| 認証 | 必須 |
| 権限 | user, admin |

#### レスポンスフィールド (GET /documents/folders/{folderId}/files/{fileId}/download-url 200 OK)

| フィールド | 型 | 説明 |
|----------|-----|------|
| downloadUrl | string | S3 Presigned GET URL（有効期限15分） |
| fileName | string | ファイル名 |
| expiresIn | number | 有効期限（秒） |

### DELETE /documents/folders/{folderId}/files/{fileId}

| 項目 | 内容 |
|------|------|
| 説明 | ファイル削除（S3オブジェクト + DynamoDBメタデータ） |
| 認証 | 必須 |
| 権限 | アップロード者または admin |
