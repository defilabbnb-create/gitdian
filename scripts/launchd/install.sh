#!/bin/zsh

set -euo pipefail

ROOT="/Users/v188/Documents/gitdian"
HOME_DIR="/Users/v188"
RUNTIME_HOME="${HOME_DIR}/Library/Application Support/gitdian"
BIN_DIR="${RUNTIME_HOME}/bin"
PLIST_DIR="${HOME_DIR}/Library/LaunchAgents"
LOG_DIR="${HOME_DIR}/Library/Logs/gitdian"
SYNC_ONLY="${SYNC_ONLY:-0}"
PRESERVE_RUNTIME_ENV="${PRESERVE_RUNTIME_ENV:-0}"

mkdir -p "$BIN_DIR" "$PLIST_DIR" "$LOG_DIR"

copy_if_exists() {
  local source_file="$1"
  local target_file="$2"

  if [[ -f "$source_file" ]]; then
    cp "$source_file" "$target_file"
    chmod 600 "$target_file"
  else
    rm -f "$target_file"
  fi
}

copy_runtime_env_if_exists() {
  local source_file="$1"
  local target_file="$2"

  if [[ "$PRESERVE_RUNTIME_ENV" == "1" && -f "$target_file" ]]; then
    chmod 600 "$target_file"
    return 0
  fi

  copy_if_exists "$source_file" "$target_file"
}

merge_runtime_env_if_exists() {
  local base_file="$1"
  local overlay_file="$2"
  local target_file="$3"
  local temp_file

  if [[ "$PRESERVE_RUNTIME_ENV" == "1" && -f "$target_file" ]]; then
    chmod 600 "$target_file"
    return 0
  fi

  if [[ ! -f "$base_file" && ! -f "$overlay_file" ]]; then
    rm -f "$target_file"
    return 0
  fi

  temp_file="$(mktemp)"

  if [[ -f "$base_file" ]]; then
    cat "$base_file" > "$temp_file"
  else
    : > "$temp_file"
  fi

  if [[ -f "$overlay_file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue

      if grep -q "^${line%%=*}=" "$temp_file"; then
        continue
      fi

      printf '%s\n' "$line" >> "$temp_file"
    done < "$overlay_file"
  fi

  mv "$temp_file" "$target_file"
  chmod 600 "$target_file"
}

wait_for_port_release() {
  local port="$1"
  local attempts="${2:-30}"

  while (( attempts > 0 )); do
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
    (( attempts-- ))
  done

  echo "Timed out waiting for port $port to be released." >&2
  return 1
}

bootstrap_launch_agent() {
  local label="$1"
  local plist="$2"
  local domain="gui/$(id -u)"

  launchctl bootstrap "$domain" "$plist"

  if launchctl print "$domain/$label" >/dev/null 2>&1; then
    launchctl kickstart -k "$domain/$label" >/dev/null 2>&1 || true
    return 0
  fi

  echo "Warning: launchd service $label was not immediately visible after bootstrap; relying on RunAtLoad." >&2
}

copy_runtime_env_if_exists "$ROOT/.env" "$RUNTIME_HOME/root.env"
merge_runtime_env_if_exists "$ROOT/.env" "$ROOT/apps/api/.env" "$RUNTIME_HOME/api.env"
merge_runtime_env_if_exists "$ROOT/.env" "$ROOT/apps/api/.env" "$RUNTIME_HOME/worker.env"
merge_runtime_env_if_exists "$ROOT/.env" "$ROOT/apps/web/.env" "$RUNTIME_HOME/web.env"

for script_name in load-env.sh start-api.sh start-worker.sh start-web.sh; do
  cp "$ROOT/scripts/launchd/$script_name" "$BIN_DIR/$script_name"
  chmod 755 "$BIN_DIR/$script_name"
done

cat > "$PLIST_DIR/com.gitdian.api.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.gitdian.api</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>/Users/v188/Library/Application Support/gitdian/bin/start-api.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/v188</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>/Users/v188/Library/Logs/gitdian/api.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/v188/Library/Logs/gitdian/api.stderr.log</string>
  </dict>
</plist>
EOF

cat > "$PLIST_DIR/com.gitdian.worker.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.gitdian.worker</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>/Users/v188/Library/Application Support/gitdian/bin/start-worker.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/v188</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>/Users/v188/Library/Logs/gitdian/worker.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/v188/Library/Logs/gitdian/worker.stderr.log</string>
  </dict>
</plist>
EOF

cat > "$PLIST_DIR/com.gitdian.web.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.gitdian.web</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>/Users/v188/Library/Application Support/gitdian/bin/start-web.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/v188</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>/Users/v188/Library/Logs/gitdian/web.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/v188/Library/Logs/gitdian/web.stderr.log</string>
  </dict>
</plist>
EOF

for plist in \
  "$PLIST_DIR/com.gitdian.api.plist" \
  "$PLIST_DIR/com.gitdian.worker.plist" \
  "$PLIST_DIR/com.gitdian.web.plist"; do
  plutil -lint "$plist" >/dev/null
done

if [[ "$SYNC_ONLY" == "1" ]]; then
  echo "Installed gitdian LaunchAgents in sync-only mode."
  exit 0
fi

pkill -f '/Users/v188/Documents/gitdian/apps/api/dist/main' 2>/dev/null || true
pkill -f '/Users/v188/Documents/gitdian/apps/api/dist/worker' 2>/dev/null || true
pkill -f 'pnpm --dir /Users/v188/Documents/gitdian --filter web start' 2>/dev/null || true
pkill -f 'next dev -p 3000' 2>/dev/null || true
pkill -f 'next-server' 2>/dev/null || true

wait_for_port_release 3001 || true
wait_for_port_release 3000 || true

for label in com.gitdian.api com.gitdian.worker com.gitdian.web; do
  launchctl bootout "gui/$(id -u)" "$PLIST_DIR/$label.plist" 2>/dev/null || true
  launchctl remove "$label" 2>/dev/null || true
done

for label in com.gitdian.api com.gitdian.worker com.gitdian.web; do
  bootstrap_launch_agent "$label" "$PLIST_DIR/$label.plist"
done

echo "Installed gitdian LaunchAgents."
