---
sheet_name: インフラ構成
output_xlsx: artifacts/infrastructure.xlsx
source: template.yaml, samconfig.toml, .github/workflows/
version: 1.0.0
last_updated: 2026-03-08
---

# インフラ構成書

## アーキテクチャ概要

```mermaid
graph TB
    subgraph Client
        Browser[Webブラウザ / APIクライアント]
    end

    subgraph AWS["AWS (ap-northeast-1)"]
        subgraph Auth["認証基盤"]
            Cognito[Cognito User Pool\n- AdminGroup\n- UserGroup\n- JWT発行]
        end

        subgraph API["API Layer"]
            APIGW[API Gateway\nHTTP API\nJWT Authorizer]
        end

        subgraph Compute["Compute Layer (Lambda arm64)"]
            UsersLambda[UsersFunction\n256MB / 29s]
            SchedulesLambda[SchedulesFunction\n256MB / 29s]
            FacilitiesLambda[FacilitiesFunction\n256MB / 29s]
            DocumentsLambda[DocumentsFunction\n256MB / 29s]
            CommonLayer[CommonLayer\nresponse / auth / db_client]
        end

        subgraph Storage["Storage Layer"]
            DDB[DynamoDB\ngroupware-{env}\nPAY_PER_REQUEST\n3 GSI + TTL + PITR]
            S3[S3 Bucket\ngroupware-docs-{env}-{accountId}\nVersioning ON]
        end
    end

    subgraph CICD["CI/CD (GitHub)"]
        GHActions[GitHub Actions]
        SAMArtifacts[SAM Artifacts S3]
        CFn[CloudFormation]
    end

    Browser -->|HTTPS + JWT| APIGW
    Browser -->|S3 Presigned URL| S3
    APIGW --> Cognito
    APIGW --> UsersLambda
    APIGW --> SchedulesLambda
    APIGW --> FacilitiesLambda
    APIGW --> DocumentsLambda

    UsersLambda --> CommonLayer
    SchedulesLambda --> CommonLayer
    FacilitiesLambda --> CommonLayer
    DocumentsLambda --> CommonLayer

    UsersLambda --> DDB
    UsersLambda --> Cognito
    SchedulesLambda --> DDB
    FacilitiesLambda --> DDB
    DocumentsLambda --> DDB
    DocumentsLambda --> S3

    S3 -->|ObjectCreated Event| DocumentsLambda

    GHActions --> SAMArtifacts
    SAMArtifacts --> CFn
    CFn --> Compute
    CFn --> Storage
    CFn --> Auth
    CFn --> API
```

## AWSリソース一覧

| リソース名 | タイプ | 用途 | 料金ティア |
|----------|--------|------|----------|
| GroupwareApi | API Gateway HTTP API | REST APIエンドポイント（Cognito JWT認証） | $1.00/100万リクエスト |
| CognitoUserPool | Cognito User Pool | 認証基盤（メールベースログイン） | 無料（50K MAU以下） |
| CognitoUserPoolClient | Cognito App Client | SPA/APIクライアント設定 | 無料 |
| AdminUserGroup | Cognito Group | 管理者グループ | 無料 |
| RegularUserGroup | Cognito Group | 一般ユーザーグループ | 無料 |
| CommonLayer | Lambda Layer | 共通ライブラリ（response/auth/db_client） | Lambda料金に含まれる |
| UsersFunction | Lambda (arm64) | ユーザー管理（Cognito Admin API） | ~$0.05/月 |
| SchedulesFunction | Lambda (arm64) | スケジュール管理（GSI期間クエリ） | ~$0.05/月 |
| FacilitiesFunction | Lambda (arm64) | 施設予約管理（排他制御） | ~$0.05/月 |
| DocumentsFunction | Lambda (arm64) | ドキュメント管理（S3 Presigned URL） | ~$0.05/月 |
| GroupwareTable | DynamoDB | シングルテーブル設計（全エンティティ） | ~$0.75/月 |
| DocumentsBucket | S3 | ドキュメントファイル格納（バージョニング有効） | ~$0.30/月 |

## DynamoDBインデックス構成

| インデックス名 | 種別 | PK | SK | 用途 |
|-------------|------|----|----|------|
| (Primary) | Base Table | PK | SK | エンティティの直接取得 |
| DateRangeIndex | GSI | gsi1pk | gsi1sk | スケジュール月次・週次表示 |
| ReservationByDateIndex | GSI | gsi2pk | gsi2sk | 日付横断の施設予約確認 |
| UserByEmailIndex | GSI | gsi3pk | gsi3sk | メールアドレスからのユーザー検索 |

## S3バケット構成

| パス | 用途 |
|------|------|
| uploads/{folderId}/{fileId}/{fileName} | アップロード中・完了ファイルの格納場所 |

## CI/CDパイプライン

| ステップ | トリガー | 実行内容 |
|--------|---------|---------|
| PR Checks | Pull Request作成・更新 | cfn-lint / ruff / pytest (coverage 80%以上) |
| Deploy Dev | develop ブランチへのpush | sam build + sam deploy --config-env dev |
| Deploy Prod | main ブランチへのpush | 手動承認後 sam build + sam deploy --config-env prod |

## Lambda設定一覧

| Function名 | Runtime | Architecture | Memory | Timeout | Layer |
|-----------|---------|-------------|--------|---------|-------|
| UsersFunction | Python 3.12 | arm64 | 256MB | 29秒 | CommonLayer |
| SchedulesFunction | Python 3.12 | arm64 | 256MB | 29秒 | CommonLayer |
| FacilitiesFunction | Python 3.12 | arm64 | 256MB | 29秒 | CommonLayer |
| DocumentsFunction | Python 3.12 | arm64 | 256MB | 29秒 | CommonLayer |

## コスト見積もり（月額）

| サービス | 想定使用量 | 月額コスト |
|---------|---------|---------|
| Lambda (arm64, 256MB, 100K invocations) | 100,000回 × 平均100ms | ~$0.20 |
| DynamoDB on-demand (500K R/W units) | 500,000 R/W | ~$0.75 |
| API Gateway HTTP API (100K requests) | 100,000リクエスト | ~$0.10 |
| S3 (10GB storage + 10K ops) | 10GB + 10,000操作 | ~$0.30 |
| Cognito (50K MAU以下) | 無料枠内 | $0.00 |
| X-Ray (sampling) | 無料枠内 | ~$0.00 |
| 合計 | - | ~$1.35 |

## セキュリティ設計

| 項目 | 設計内容 |
|------|---------|
| 認証 | Cognito JWT (IdToken) by API Gateway JWT Authorizer |
| 認可 | Lambda内でCognitoグループ（admin/user）を確認 |
| 転送暗号化 | HTTPS強制（API Gateway・S3共にHTTPリジェクト） |
| S3パブリックアクセス | 完全ブロック（presigned URL経由のみアクセス可） |
| DynamoDB暗号化 | 保存時暗号化（AWSマネージドキー）デフォルト有効 |
| 削除保護 | DynamoDB: DeletionPolicy=Retain |
| バックアップ | DynamoDB: PITR有効、S3: バージョニング有効 |

## 環境一覧

| 環境名 | ブランチ | スタック名 | デプロイ方式 |
|------|---------|----------|------------|
| dev | develop | groupware-dev | 自動（push時） |
| prod | main | groupware-prod | 手動承認後（GitHub Environment protection） |
