# Deploy Automation Design

**Date:** 2026-03-21
**Scope:** dev 環境への自動デプロイ (GitHub Actions + ローカルスクリプト)

---

## 概要

develop ブランチへの push を起点に、バックエンド (SAM) とフロントエンド (Vite→S3) を自動デプロイするワークフローを追加する。あわせてローカルから1コマンドでデプロイできるシェルスクリプトを用意する。

---

## ファイル構成

```
.github/workflows/deploy-dev.yml   # 新規: dev 自動デプロイワークフロー
deploy-dev.sh                      # 新規: ローカル用デプロイスクリプト
```

既存ファイルへの変更なし。

---

## GitHub Actions ワークフロー (`deploy-dev.yml`)

### トリガー

```yaml
on:
  push:
    branches:
      - develop
```

### Job 構成

#### `backend-deploy`

| ステップ | 内容 |
|---|---|
| checkout | actions/checkout@v4 |
| Python 3.12 | actions/setup-python@v5, cache: pip |
| SAM CLI インストール | pip install aws-sam-cli |
| AWS 認証 | aws-actions/configure-aws-credentials@v4 (access key 方式) |
| sam build | `sam build --parallel --cached` |
| sam deploy | `sam deploy --config-env dev --no-fail-on-empty-changeset` |
| stack info | `aws cloudformation describe-stacks` でアウトプット表示 |

#### `frontend-deploy`

`needs: backend-deploy` — backend が失敗した場合はスキップ。

| ステップ | 内容 |
|---|---|
| checkout | actions/checkout@v4 |
| Node.js | actions/setup-node@v4, cache: npm |
| 依存インストール | `npm ci` (frontend/ ディレクトリ) |
| ビルド | `npm run build` |
| S3 sync (JS) | `--content-type "application/javascript"` |
| S3 sync (CSS) | `--content-type "text/css"` |
| S3 cp (HTML) | `--content-type "text/html; charset=utf-8"` |

### AWS 認証 (Secrets)

| Secret 名 | 説明 |
|---|---|
| `AWS_ACCESS_KEY_ID` | dev デプロイ用 IAM ユーザーキー |
| `AWS_SECRET_ACCESS_KEY` | 同上 |

prod ワークフローの OIDC 設定とは独立しており競合なし。

### リージョン

`ap-northeast-1` (samconfig.toml の dev 設定と一致)

---

## ローカルスクリプト (`deploy-dev.sh`)

- AWS プロファイル: `ec-site-poc`
- 対象: dev 環境のみ
- 実行方法: `bash deploy-dev.sh` (Git Bash / WSL)
- `set -euo pipefail` でエラー即終了

### 処理フロー

1. SAM build (`--parallel --cached`)
2. SAM deploy (`--config-env dev --no-fail-on-empty-changeset --profile ec-site-poc`)
3. frontend build (`cd frontend && npm run build`)
4. S3 sync: JS → CSS → HTML (Content-Type 明示)

---

## 既存構成との関係

| 環境 | バックエンド | フロントエンド |
|---|---|---|
| dev (CI) | `deploy-dev.yml` (新規) | `deploy-dev.yml` (新規) |
| dev (ローカル) | `deploy-dev.sh` (新規) | `deploy-dev.sh` (新規) |
| prod (CI) | `deploy-prod.yml` (既存・変更なし) | 未対応 (スコープ外) |

---

## ユーザー対応が必要な事項

1. **GitHub Secrets の登録**: リポジトリの Settings → Secrets and variables → Actions に `AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` を追加
2. **IAM ユーザー/キーの確認**: dev デプロイに必要な権限 (CloudFormation, S3, Lambda 等) を持つキーが存在するか確認
