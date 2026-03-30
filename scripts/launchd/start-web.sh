#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export GITDIAN_SERVICE_NAME="web"
source "$SCRIPT_DIR/load-env.sh"

resolve_next_bin() {
  local candidate

  for candidate in \
    "$ROOT/apps/web/node_modules/next/dist/bin/next" \
    "$ROOT/node_modules/next/dist/bin/next"; do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  echo "Unable to locate Next.js CLI runtime." >&2
  return 1
}

ensure_shared_build() {
  if artifact_missing_or_stale \
    "$ROOT/packages/shared/dist/index.js" \
    "$ROOT/packages/shared/src" \
    "$ROOT/packages/shared/package.json" \
    "$ROOT/packages/shared/tsconfig.json"; then
    /Users/v188/.local/bin/pnpm --dir "$ROOT" --filter shared build
  fi

  "$NODE_BIN" "$ROOT/scripts/sync-web-shared-vendor.mjs"
}

ensure_shared_build

if artifact_missing_or_stale \
  "$ROOT/apps/web/.next/BUILD_ID" \
  "$ROOT/apps/web/src" \
  "$ROOT/apps/web/package.json" \
  "$ROOT/apps/web/tsconfig.json" \
  "$ROOT/apps/web/next.config.ts" \
  "$ROOT/apps/web/next.config.js" \
  "$ROOT/apps/web/next.config.mjs" \
  "$ROOT/apps/web/postcss.config.js" \
  "$ROOT/apps/web/postcss.config.mjs" \
  "$ROOT/apps/web/tailwind.config.ts" \
  "$ROOT/apps/web/tailwind.config.js" \
  "$ROOT/packages/shared/dist"; then
  /Users/v188/.local/bin/pnpm --dir "$ROOT" --filter web build
fi

export NODE_ENV="production"
log_runtime_summary

NEXT_BIN="$(resolve_next_bin)"

cd "$ROOT/apps/web"

exec "$NODE_BIN" "$NEXT_BIN" start -p 3000
