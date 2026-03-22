---
sheet_name: DB定義書
output_xlsx: artifacts/db-definition.xlsx
source: template.yaml, backend/functions/*/handler.py
version: 1.0.0
last_updated: 2026-03-08
---

# DB定義書

## テーブル基本情報

| 項目 | 値 |
|------|-----|
| テーブル名 | groupware-{env} |
| 課金モード | PAY_PER_REQUEST（オンデマンド） |
| リージョン | ap-northeast-1 |
| 削除保護 | Retain |
| PITR（ポイントインタイムリカバリ） | 有効 |
| TTL属性名 | ttl |
| 設計方針 | シングルテーブル設計 |

## エンティティ一覧

| エンティティ | PK | SK | 説明 |
|------------|----|----|------|
| ユーザープロファイル | USER#{userId} | #METADATA | Cognitoユーザーの補足情報 |
| スケジュール（公開） | SCHEDULE#PUBLIC | EVENT#{eventId} | 全員が参照可能なスケジュール |
| スケジュール（非公開） | SCHEDULE#{userId} | EVENT#{eventId} | 作成者のみ参照可能なスケジュール |
| 施設定義 | FACILITY#{facilityId} | #METADATA | 会議室等の施設マスター |
| 施設予約 | FACILITY#{facilityId} | RESERVATION#{date}T{time}#{reservationId} | 施設の予約情報 |
| 予約ロック | FACILITY#{facilityId} | LOCK#{date}T{time} | 重複予約防止用一時ロック（TTL付き） |
| ドキュメントフォルダ | DOCS#{folderId} | #METADATA | フォルダメタデータ |
| ドキュメントファイル | DOCS#{folderId} | FILE#{fileId} | ファイルメタデータ（実体はS3） |

## GSI定義

| GSI名 | PK属性 (gsi Pk) | SK属性 (gsi Sk) | ProjectionType | ユースケース |
|-------|----------------|----------------|----------------|------------|
| DateRangeIndex | gsi1pk | gsi1sk | ALL | スケジュール月次・週次表示（期間クエリ） |
| ReservationByDateIndex | gsi2pk | gsi2sk | ALL | 指定日の全施設予約一覧取得 |
| UserByEmailIndex | gsi3pk | gsi3sk | KEYS_ONLY | メールアドレスによるユーザー検索 |

## GSIキー値マッピング

| エンティティ | gsi1pk | gsi1sk | gsi2pk | gsi2sk | gsi3pk | gsi3sk |
|------------|--------|--------|--------|--------|--------|--------|
| スケジュール | SCHEDULE#{YYYY-MM} | {startDatetime ISO-8601} | - | - | - | - |
| 施設予約 | - | - | RESERVATION#{YYYY-MM-DD} | {facilityId}#{HH:MM} | - | - |
| ユーザー | - | - | - | - | {email} | USER |

## 属性定義 - ユーザープロファイル

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | USER#abc-123 |
| SK | String | ○ | ソートキー（固定値） | #METADATA |
| entityType | String | ○ | エンティティ種別 | USER |
| userId | String | ○ | CognitoのSub（UUID） | abc-123-... |
| email | String | ○ | メールアドレス | user@example.com |
| name | String | ○ | 表示名 | 田中 太郎 |
| role | String | ○ | ロール（admin/editor/user） | user |
| createdAt | String | ○ | 作成日時（ISO-8601） | 2026-03-08T00:00:00+00:00 |
| updatedAt | String | ○ | 更新日時（ISO-8601） | 2026-03-08T00:00:00+00:00 |
| gsi3pk | String | ○ | GSI3用PK（email） | user@example.com |
| gsi3sk | String | ○ | GSI3用SK（固定値） | USER |

## 属性定義 - スケジュール

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | SCHEDULE#PUBLIC |
| SK | String | ○ | ソートキー | EVENT#uuid-... |
| entityType | String | ○ | エンティティ種別 | SCHEDULE |
| eventId | String | ○ | イベントID（UUID） | uuid-... |
| title | String | ○ | イベントタイトル（最大200文字） | 全社会議 |
| description | String | - | 説明（最大2000文字） | 四半期振り返り |
| startDatetime | String | ○ | 開始日時（ISO-8601） | 2026-03-08T10:00:00+09:00 |
| endDatetime | String | ○ | 終了日時（ISO-8601） | 2026-03-08T11:00:00+09:00 |
| allDay | Boolean | - | 終日フラグ | false |
| location | String | - | 場所（最大500文字） | 第1会議室 |
| isPublic | Boolean | ○ | 公開フラグ | true |
| createdBy | String | ○ | 作成者userId | abc-123 |
| createdAt | String | ○ | 作成日時 | 2026-03-08T00:00:00+00:00 |
| updatedAt | String | ○ | 更新日時 | 2026-03-08T00:00:00+00:00 |
| gsi1pk | String | ○ | SCHEDULE#{YYYY-MM} | SCHEDULE#2026-03 |
| gsi1sk | String | ○ | 開始日時（ISO-8601、GSI1ソートキー） | 2026-03-08T10:00:00+09:00 |

## 属性定義 - 施設

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | FACILITY#uuid-... |
| SK | String | ○ | ソートキー（固定値） | #METADATA |
| entityType | String | ○ | エンティティ種別 | FACILITY |
| facilityId | String | ○ | 施設ID（UUID） | uuid-... |
| name | String | ○ | 施設名（最大200文字） | 第1会議室 |
| description | String | - | 説明（最大1000文字） | 10人収容 プロジェクター有 |
| capacity | Number | - | 収容人数 | 10 |
| location | String | - | 場所（最大500文字） | 3F 東棟 |
| createdBy | String | ○ | 作成者userId | abc-123 |
| createdAt | String | ○ | 作成日時 | 2026-03-08T00:00:00+00:00 |
| `parentId` | String | - | 親施設のfacilityId。なければ `ROOT` | `ROOT` |
| `facilityType` | String | - | `group`（親グループ）または `facility`（予約可能施設） | `facility` |

## 属性定義 - 施設予約

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | FACILITY#uuid-... |
| SK | String | ○ | ソートキー | RESERVATION#2026-03-08T10:00#uuid-... |
| entityType | String | ○ | エンティティ種別 | RESERVATION |
| reservationId | String | ○ | 予約ID（UUID） | uuid-... |
| facilityId | String | ○ | 施設ID | uuid-... |
| title | String | ○ | 予約タイトル（最大200文字） | マーケティング定例 |
| startDatetime | String | ○ | 開始日時（ISO-8601） | 2026-03-08T10:00:00+09:00 |
| endDatetime | String | ○ | 終了日時（ISO-8601） | 2026-03-08T11:00:00+09:00 |
| reservedBy | String | ○ | 予約者userId | abc-123 |
| attendees | List | - | 参加者userIdリスト | ["abc-123", "def-456"] |
| notes | String | - | メモ（最大2000文字） | 議事録URL: ... |
| createdAt | String | ○ | 作成日時 | 2026-03-08T00:00:00+00:00 |
| gsi2pk | String | ○ | RESERVATION#{YYYY-MM-DD} | RESERVATION#2026-03-08 |
| gsi2sk | String | ○ | {facilityId}#{HH:MM} | uuid-...#10:00 |

## 属性定義 - 予約ロック

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | FACILITY#uuid-... |
| SK | String | ○ | ソートキー | LOCK#2026-03-08T10:00 |
| entityType | String | ○ | エンティティ種別 | LOCK |
| reservationId | String | ○ | 対応する予約ID | uuid-... |
| ttl | Number | ○ | TTL（UNIXタイムスタンプ、5分後） | 1709899200 |

## 属性定義 - ドキュメントフォルダ

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | DOCS#uuid-... |
| SK | String | ○ | ソートキー（固定値） | #METADATA |
| entityType | String | ○ | エンティティ種別 | FOLDER |
| folderId | String | ○ | フォルダID（UUID） | uuid-... |
| name | String | ○ | フォルダ名（最大100文字） | 2026年度 議事録 |
| parentFolderId | String | ○ | 親フォルダID（ルートはROOT） | ROOT |
| folderPath | String | ○ | フォルダのフルパス | /2026年度 議事録 |
| createdBy | String | ○ | 作成者userId | abc-123 |
| createdAt | String | ○ | 作成日時 | 2026-03-08T00:00:00+00:00 |
| updatedAt | String | ○ | 更新日時 | 2026-03-08T00:00:00+00:00 |

## 属性定義 - ドキュメントファイル

| 属性名 | 型 | 必須 | 説明 | 例 |
|--------|-----|------|------|-----|
| PK | String | ○ | パーティションキー | DOCS#uuid-... |
| SK | String | ○ | ソートキー | FILE#uuid-... |
| entityType | String | ○ | エンティティ種別 | FILE |
| fileId | String | ○ | ファイルID（UUID） | uuid-... |
| folderId | String | ○ | 所属フォルダID | uuid-... |
| name | String | ○ | ファイル名（最大255文字） | 議事録_2026-03.pdf |
| contentType | String | ○ | MIMEタイプ | application/pdf |
| size | Number | - | ファイルサイズ（バイト） | 102400 |
| s3Key | String | ○ | S3オブジェクトキー | uploads/{folderId}/{fileId}/{name} |
| status | String | ○ | アップロード状態（pending/uploaded） | uploaded |
| uploadedBy | String | ○ | アップロード者userId | abc-123 |
| createdAt | String | ○ | 作成日時 | 2026-03-08T00:00:00+00:00 |
| updatedAt | String | ○ | 更新日時 | 2026-03-08T00:00:00+00:00 |
