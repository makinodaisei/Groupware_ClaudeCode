# 社内グループウェア MVP

AWS Serverless で動作する社内グループウェアと、**定義ファイルベースの完全自動ドキュメント生成エコシステム**。

## アーキテクチャ

```
Client (Browser)
  └── API Gateway HTTP API (Cognito JWT Authorizer)
        ├── /users        → Lambda (UsersFunction)    → Cognito Admin API
        ├── /schedules    → Lambda (SchedulesFunction) → DynamoDB (DateRangeIndex GSI)
        ├── /facilities   → Lambda (FacilitiesFunction)→ DynamoDB (TransactWriteItems)
        └── /documents    → Lambda (DocumentsFunction) → DynamoDB + S3 (Presigned URL)
```

**月額コスト目安: ~$1.35**（50ユーザー規模）

---

## クイックスタート

### 前提条件

```bash
# AWS CLI + SAM CLI + Python 3.12
pip install aws-sam-cli
aws configure   # IAMキーを設定
```

### デプロイ (dev)

```bash
sam build --parallel
sam deploy --config-env dev
```

### デプロイ (prod)

```bash
sam deploy --config-env prod   # GitHub Environmentの承認が必要
```

---

## ドキュメント生成

### 1. ドキュメントを更新する

コードを変更したら `docs/skills.md` のルールに従い、対応するドキュメントを更新：

| 変更箇所 | 更新するドキュメント |
|---------|-----------------|
| `template.yaml` DynamoDB | `docs/db-definition.md` |
| `backend/functions/*/handler.py` | `docs/api-spec.md` |
| `template.yaml` リソース全般 | `docs/infrastructure.md` |

### 2. Excelを生成する

```bash
pip install openpyxl pyyaml

# 個別変換
python tools/md2excel.py --input docs/db-definition.md --output artifacts/db-definition.xlsx
python tools/md2excel.py --input docs/api-spec.md --output artifacts/api-spec.xlsx
python tools/md2excel.py --input docs/infrastructure.md --output artifacts/infrastructure.xlsx

# 一括変換
python tools/md2excel.py --all
```

---

## プロジェクト構造

```
.
├── template.yaml                    # SAM テンプレート（全AWSリソース定義）
├── samconfig.toml                   # SAM デプロイ設定（dev/prod）
├── pyproject.toml                   # ruff + pytest 設定
│
├── backend/
│   ├── layers/common/python/        # 全Lambda共通ライブラリ
│   │   ├── response.py              # HTTPレスポンスビルダー
│   │   ├── auth.py                  # Cognito JWT クレーム抽出
│   │   ├── db_client.py             # DynamoDB/S3/Cognito クライアント
│   │   ├── exceptions.py            # ドメイン例外クラス
│   │   └── validators.py            # バリデーションユーティリティ
│   └── functions/
│       ├── users/handler.py         # ユーザー管理 (Cognito Admin API)
│       ├── schedules/handler.py     # スケジュール管理 (GSI期間クエリ)
│       ├── facilities/handler.py    # 施設予約 (TransactWriteItems排他制御)
│       └── documents/handler.py    # 文書管理 (S3 Presigned URL)
│
├── docs/
│   ├── skills.md                    # ★ ドキュメント生成ルール定義ファイル
│   ├── db-definition.md             # DB定義書
│   ├── api-spec.md                  # API仕様書
│   └── infrastructure.md            # インフラ構成書
│
├── tools/
│   └── md2excel.py                  # Markdown → Excel 変換スクリプト
│
├── frontend/
│   └── index.html                   # SPA フロントエンド（デモUI）
│
└── .github/workflows/
    ├── pr-checks.yml                # PR: cfn-lint + ruff + pytest
    ├── deploy-dev.yml               # develop push → dev自動デプロイ
    └── deploy-prod.yml              # main push → prod手動承認デプロイ
```

---

## GitHub Secrets 設定

| Secret名 | 説明 |
|---------|------|
| `AWS_DEPLOY_ROLE_ARN` | GitHub OIDC用 IAMロールARN |
| `DEV_COGNITO_USER_POOL_ID` | dev環境のCognito User Pool ID |
| `DEV_COGNITO_USER_POOL_CLIENT_ID` | dev環境のCognito Client ID |
| `PROD_COGNITO_USER_POOL_ID` | prod環境のCognito User Pool ID |
| `PROD_COGNITO_USER_POOL_CLIENT_ID` | prod環境のCognito Client ID |

### GitHub OIDC IAMロール（最小権限ポリシー）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "dynamodb:*",
        "s3:*",
        "cognito-idp:*",
        "apigateway:*",
        "iam:PassRole",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRole"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## テスト実行

```bash
cd backend
pip install -r requirements.txt

# ユニットテスト
pytest -v

# カバレッジ付き
pytest --cov=. --cov-report=term-missing
```

---

## 主要設計決定事項

| 決定事項 | 選択 | 理由 |
|---------|------|------|
| アーキテクチャ | シングルテーブルDynamoDB | コスト最小化・トランザクション簡素化 |
| Lambda構成 | ドメインごとに1Lambda（4個） | コールドスタート削減・IAM管理簡素化 |
| API Gateway | HTTP API（REST APIではなく） | 約70%コスト削減、CognitoJWT対応 |
| Lambda CPU | arm64 (Graviton2) | 約20%コスト削減 |
| 排他制御 | TransactWriteItems + ConditionExpression | DynamoDBネイティブでアトミックな排他制御 |
| ファイルアップロード | S3 Presigned URL | Lambdaメモリにファイルをバッファリングせずコストゼロ |
| ドキュメント | Markdownファースト + md2excel.py変換 | コード管理可能・Excelを要求する関係者にも対応 |
