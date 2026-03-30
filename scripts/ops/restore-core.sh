#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <backup-dir> --force" >&2
  exit 1
fi

BACKUP_DIR="$1"
FORCE_FLAG="$2"

if [[ "$FORCE_FLAG" != "--force" ]]; then
  echo "Refusing to restore without --force." >&2
  exit 1
fi

if [[ ! -d "$BACKUP_DIR" || ! -f "$BACKUP_DIR/core-data.sql" ]]; then
  echo "Backup directory is missing core-data.sql: $BACKUP_DIR" >&2
  exit 1
fi

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

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH." >&2
  exit 1
fi

PSQL_DATABASE_URL="$(sanitize_database_url "$DATABASE_URL")"

psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE
  "DailyRadarSummary",
  "RepositoryAnalysis",
  "Repository",
  "SystemConfig"
RESTART IDENTITY CASCADE;
SQL

psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKUP_DIR/core-data.sql"

echo "Restore completed from: $BACKUP_DIR"
