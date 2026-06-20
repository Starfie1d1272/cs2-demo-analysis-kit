#!/usr/bin/env bash
set -euo pipefail

: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"

SOURCE="${1:-dist/events}"
if [[ ! -f "$SOURCE/manifest.json" ]]; then
  echo "missing $SOURCE/manifest.json; run build-event-asset first" >&2
  exit 2
fi

# 先上传不可变赛事 ZIP，最后替换短缓存 manifest，避免客户端看到尚未就绪的资产。
aws s3 sync "$SOURCE" "s3://${R2_BUCKET}/events/" \
  --exclude "manifest.json" \
  --endpoint-url "$R2_ENDPOINT" \
  --checksum-algorithm SHA256 \
  --cache-control "public,max-age=31536000,immutable"

aws s3 cp "$SOURCE/manifest.json" "s3://${R2_BUCKET}/events/manifest.json" \
  --endpoint-url "$R2_ENDPOINT" \
  --checksum-algorithm SHA256 \
  --cache-control "public,max-age=300"

echo "published event assets to s3://${R2_BUCKET}/events/"
