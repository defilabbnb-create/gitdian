#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_ROOT="${ROOT}/backups/gitdian-core"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Load .env or export DATABASE_URL first." >&2
  exit 1
fi

sanitize_database_url() {
  /opt/homebrew/bin/node -e 'const url = new URL(process.argv[1]); url.searchParams.delete("schema"); console.log(url.toString())' "$1"
}

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
PG_DUMP_DATABASE_URL="$(sanitize_database_url "$DATABASE_URL")"

pg_dump "$PG_DUMP_DATABASE_URL" \
  --schema-only \
  -t 'public."SystemConfig"' \
  -t 'public."Repository"' \
  -t 'public."RepositoryAnalysis"' \
  -t 'public."DailyRadarSummary"' \
  > "$TARGET_DIR/schema.sql"

pg_dump "$PG_DUMP_DATABASE_URL" \
  --data-only \
  --column-inserts \
  -t 'public."SystemConfig"' \
  -t 'public."Repository"' \
  -t 'public."RepositoryAnalysis"' \
  -t 'public."DailyRadarSummary"' \
  > "$TARGET_DIR/core-data.sql"

cat > "$TARGET_DIR/manifest.txt" <<EOF
created_at=$(date -Iseconds)
root=$ROOT
tables=SystemConfig,Repository,RepositoryAnalysis,DailyRadarSummary
schema_file=schema.sql
data_file=core-data.sql
EOF

echo "Backup created at: $TARGET_DIR"
