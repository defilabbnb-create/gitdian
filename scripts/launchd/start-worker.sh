#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export GITDIAN_SERVICE_NAME="worker"
source "$SCRIPT_DIR/load-env.sh"

if artifact_missing_or_stale \
  "$ROOT/apps/api/dist/worker.js" \
  "$ROOT/apps/api/src" \
  "$ROOT/apps/api/prisma" \
  "$ROOT/apps/api/package.json" \
  "$ROOT/shared"; then
  /Users/v188/.local/bin/pnpm --dir "$ROOT" --filter api build
fi

export NODE_ENV="production"
export ENABLE_QUEUE_WORKERS="true"
log_runtime_summary

exec "$NODE_BIN" "$ROOT/apps/api/dist/worker.js"
