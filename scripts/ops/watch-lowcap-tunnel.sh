#!/bin/bash

set -euo pipefail

USER_ID="$(/usr/bin/id -u)"
LABEL="com.lowcap.tunnel"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:3000/cold-tools}"
PUBLIC_URL="${PUBLIC_URL:-https://local3000.luckytad.vip/cold-tools}"
STATE_DIR="${HOME}/Library/Application Support/gitdian/tunnel-health"
STATE_FILE="${STATE_DIR}/last_restart_at"
MIN_RESTART_INTERVAL_SECONDS="${MIN_RESTART_INTERVAL_SECONDS:-45}"
VERIFY_DELAY_SECONDS="${VERIFY_DELAY_SECONDS:-4}"

mkdir -p "$STATE_DIR"

timestamp() {
  /bin/date '+%Y-%m-%dT%H:%M:%S%z'
}

http_code() {
  local url="$1"
  /usr/bin/curl -L -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || echo "000"
}

recent_restart_blocked() {
  if [[ ! -f "$STATE_FILE" ]]; then
    return 1
  fi

  local last_restart
  last_restart="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
  [[ -z "$last_restart" ]] && return 1

  local now
  now="$(/bin/date +%s)"
  if (( now - last_restart < MIN_RESTART_INTERVAL_SECONDS )); then
    return 0
  fi

  return 1
}

record_restart() {
  /bin/date +%s > "$STATE_FILE"
}

local_status="$(http_code "$LOCAL_URL")"
if [[ "$local_status" != "200" ]]; then
  echo "$(timestamp) skip tunnel recovery local_status=${local_status} local_url=${LOCAL_URL}"
  exit 0
fi

public_status="$(http_code "$PUBLIC_URL")"
if [[ "$public_status" == "200" ]]; then
  echo "$(timestamp) tunnel healthy public_status=${public_status} public_url=${PUBLIC_URL}"
  exit 0
fi

if recent_restart_blocked; then
  echo "$(timestamp) tunnel unhealthy but restart throttled public_status=${public_status} public_url=${PUBLIC_URL}"
  exit 0
fi

echo "$(timestamp) tunnel unhealthy, restarting label=${LABEL} public_status=${public_status} public_url=${PUBLIC_URL}"
record_restart
/bin/launchctl kickstart -k "gui/${USER_ID}/${LABEL}"
sleep "$VERIFY_DELAY_SECONDS"

public_status_after="$(http_code "$PUBLIC_URL")"
if [[ "$public_status_after" == "200" ]]; then
  echo "$(timestamp) tunnel recovered public_status=${public_status_after} public_url=${PUBLIC_URL}"
  exit 0
fi

echo "$(timestamp) tunnel restart did not recover public_status=${public_status_after} public_url=${PUBLIC_URL}" >&2
exit 1
