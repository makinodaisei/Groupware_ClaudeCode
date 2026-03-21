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
