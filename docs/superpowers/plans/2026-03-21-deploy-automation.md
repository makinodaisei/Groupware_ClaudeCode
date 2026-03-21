# Deploy Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dev 環境への自動デプロイを完成させる（GitHub Actions でフロントエンド追加、認証をアクセスキー方式に変更、ローカルスクリプト作成）

**Architecture:** 既存の `deploy-dev.yml` を修正して OIDC 認証をアクセスキー認証に切り替え、フロントエンド (Vite→S3) デプロイ job を追加する。ローカル開発者向けに `deploy-dev.sh` を新規作成する。

**Tech Stack:** GitHub Actions, AWS SAM CLI, AWS CLI, Vite/React, S3 Static Hosting

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/deploy-dev.yml` | Modify | OIDC→アクセスキー認証に変更、frontend-deploy job 追加 |
| `deploy-dev.sh` | Create | ローカルから1コマンドで dev デプロイ |

---

### Task 1: `deploy-dev.yml` の認証を OIDC → アクセスキー方式に変更

**Files:**
- Modify: `.github/workflows/deploy-dev.yml`

現在の `deploy-dev` job は `id-token: write` 権限と `role-to-assume` を使っている。
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` Secrets に切り替える。

- [ ] **Step 1: `permissions` ブロックを削除し、configure-aws-credentials を書き換える**

`.github/workflows/deploy-dev.yml` の `deploy-dev` job を以下のように変更:

削除するブロック:
```yaml
    permissions:
      id-token: write
      contents: read
```

`Configure AWS credentials (OIDC)` ステップを以下に置き換える:
```yaml
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-1
```

- [ ] **Step 2: ファイルを保存して差分を確認**

```bash
git diff .github/workflows/deploy-dev.yml
```

`role-to-assume` が消え `aws-access-key-id` になっていることを確認。

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/deploy-dev.yml
git commit -m "ci: switch deploy-dev auth from OIDC to access key secrets"
```

---

### Task 2: `deploy-dev.yml` にフロントエンドデプロイ job を追加

**Files:**
- Modify: `.github/workflows/deploy-dev.yml`

Vite ビルドして S3 に sync する job を追加する。
S3 はファイル種別ごとに Content-Type を明示しないと `type="module"` が動かない（S3 のデフォルトは `text/plain`）。

- [ ] **Step 1: `frontend-deploy` job を `deploy-dev.yml` の末尾に追加**

`generate-docs` job の直前（`deploy-dev` job の後）に以下を追加:

```yaml
  frontend-deploy:
    name: Frontend Deploy (S3)
    runs-on: ubuntu-latest
    needs: deploy-dev

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-1

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Build
        working-directory: frontend
        run: npm run build

      - name: Deploy JS (application/javascript)
        working-directory: frontend
        run: |
          aws s3 sync dist/ s3://groupware-frontend-dev-674594306903/ \
            --delete \
            --exclude "*" --include "*.js" \
            --content-type "application/javascript"

      - name: Deploy CSS (text/css)
        working-directory: frontend
        run: |
          aws s3 sync dist/ s3://groupware-frontend-dev-674594306903/ \
            --exclude "*" --include "*.css" \
            --content-type "text/css"

      - name: Deploy HTML (text/html)
        working-directory: frontend
        run: |
          aws s3 cp dist/index.html s3://groupware-frontend-dev-674594306903/index.html \
            --content-type "text/html; charset=utf-8"
```

また `generate-docs` job の `needs` を更新して frontend-deploy も待つようにする:

```yaml
  generate-docs:
    name: Generate Excel Docs
    runs-on: ubuntu-latest
    needs: [deploy-dev, frontend-deploy]
```

- [ ] **Step 2: YAML 構文を確認**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/deploy-dev.yml
git commit -m "ci: add frontend S3 deploy job to deploy-dev workflow"
```

---

### Task 3: ローカルデプロイスクリプト `deploy-dev.sh` を作成

**Files:**
- Create: `deploy-dev.sh`

ローカル開発者がアクセスキー不要の `ec-site-poc` プロファイルで dev 環境にデプロイするスクリプト。

- [ ] **Step 1: `deploy-dev.sh` を作成**

```bash
#!/usr/bin/env bash
set -euo pipefail

PROFILE="ec-site-poc"
FRONTEND_BUCKET="groupware-frontend-dev-674594306903"

echo "=== [1/4] SAM Build ==="
sam build --parallel --cached

echo "=== [2/4] SAM Deploy (dev) ==="
sam deploy \
  --config-env dev \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}"

echo "=== [3/4] Frontend Build ==="
(cd frontend && npm run build)

echo "=== [4/4] Frontend Deploy to S3 ==="
# JS (application/javascript — S3デフォルトのtext/plainではtype="module"が動かない)
aws s3 sync frontend/dist/ "s3://${FRONTEND_BUCKET}/" \
  --delete \
  --exclude "*" --include "*.js" \
  --content-type "application/javascript" \
  --profile "${PROFILE}"

# CSS
aws s3 sync frontend/dist/ "s3://${FRONTEND_BUCKET}/" \
  --exclude "*" --include "*.css" \
  --content-type "text/css" \
  --profile "${PROFILE}"

# HTML
aws s3 cp frontend/dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --content-type "text/html; charset=utf-8" \
  --profile "${PROFILE}"

echo ""
echo "=== Deploy complete ==="
echo "URL: http://${FRONTEND_BUCKET}.s3-website-ap-northeast-1.amazonaws.com/"
```

- [ ] **Step 2: 実行権限を付与してコミット**

```bash
git add deploy-dev.sh
git commit -m "chore: add deploy-dev.sh local deployment script"
```

---

### Task 4: 動作確認

- [ ] **Step 1: develop ブランチに push して GitHub Actions を確認**

```bash
git push origin develop
```

GitHub の Actions タブで `Deploy to Dev` ワークフローが起動していることを確認。

- [ ] **Step 2: 各 job の成功を確認**

以下の順に成功すること:
1. `SAM Deploy (dev)` — CloudFormation スタック更新
2. `Frontend Deploy (S3)` — S3 sync 完了
3. `Generate Excel Docs` — アーティファクト生成

- [ ] **Step 3: フロントエンドの動作確認**

ブラウザで以下を開いて画面が表示されること:
```
http://groupware-frontend-dev-674594306903.s3-website-ap-northeast-1.amazonaws.com/
```
