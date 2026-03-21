# Deploy Automation Design

**Date:** 2026-03-21
**Scope:** dev 環境への自動デプロイ (GitHub Actions + ローカルスクリプト)

---

## 概要

`deploy-dev.yml` は既に存在しバックエンド (SAM) デプロイは実装済み。
今回の変更:
1. 認証を OIDC → アクセスキー方式に切り替える（`AWS_DEPLOY_ROLE_ARN` 未設定のため）
2. フロントエンド (Vite→S3) デプロイ job を追加する
3. ローカル用デプロイスクリプト `deploy-dev.sh` を新規作成する

---

## ファイル変更

```
.github/workflows/deploy-dev.yml   # 既存を修正
deploy-dev.sh                      # 新規作成
```

---

## `deploy-dev.yml` の変更内容

### 認証: OIDC → アクセスキー

**変更前:**
```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
      aws-region: ap-northeast-1
```

**変更後:**
```yaml
# permissions ブロック削除
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      aws-region: ap-northeast-1
```

### 追加: `frontend-deploy` job

`needs: deploy-dev` — バックエンドが失敗した場合はスキップ。

| ステップ | 内容 |
|---|---|
| checkout | actions/checkout@v4 |
| Node.js 20 | actions/setup-node@v4, cache: npm |
| 依存インストール | `npm ci` (`working-directory: frontend`) |
| ビルド | `npm run build` (`working-directory: frontend`) |
| S3 sync (JS) | `--content-type "application/javascript" --delete` |
| S3 sync (CSS) | `--content-type "text/css"` |
| S3 cp (HTML) | `--content-type "text/html; charset=utf-8"` |

S3 バケット: `groupware-frontend-dev-674594306903`

`--delete` は JS sync のみ適用。Vite のハッシュ付きチャンクが蓄積しないようにする。

---

## `deploy-dev.sh` (新規)

- AWS プロファイル: `ec-site-poc`
- `set -euo pipefail` でエラー即終了
- 実行方法: `bash deploy-dev.sh` (Git Bash / WSL)

処理フロー:
1. `sam build --parallel --cached`
2. `sam deploy --config-env dev --no-confirm-changeset --no-fail-on-empty-changeset --profile ec-site-poc`
3. `cd frontend && npm run build`
4. S3 sync: JS (`--delete`) → CSS → HTML

---

## GitHub Secrets (ユーザー対応)

| Secret 名 | 説明 |
|---|---|
| `AWS_ACCESS_KEY_ID` | `~/.aws/credentials` の `[ec-site-poc]` から取得 |
| `AWS_SECRET_ACCESS_KEY` | 同上 |

登録場所: リポジトリ Settings → Secrets and variables → Actions

---

## 既存の維持要素

以下は既存 `deploy-dev.yml` から変更なし:
- S3 Lambda トリガー設定ステップ
- `generate-docs` job
- `concurrency: cancel-in-progress: false`
- `environment: dev`
