#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/Users/v188/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/v188"

ROOT="/Users/v188/Documents/gitdian"
RUNTIME_HOME="${HOME}/Library/Application Support/gitdian"
LOG_DIR="/Users/v188/Library/Logs/gitdian"

load_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    set -a
    source "$env_file"
    set +a
  fi
}

mkdir -p "$LOG_DIR"

resolve_node_bin() {
  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
    echo "${NODE_BIN}"
    return
  fi

  if [[ -x "/opt/homebrew/opt/node@22/bin/node" ]]; then
    echo "/opt/homebrew/opt/node@22/bin/node"
    return
  fi

  local candidate

  for candidate in \
    "$HOME/.nvm"/versions/node/v22*/bin/node \
    "$HOME/.volta"/tools/image/node/22*/bin/node \
    "$HOME/.asdf"/installs/nodejs/22*/bin/node; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  echo "/opt/homebrew/bin/node"
}

node_major_version() {
  local version
  version="$("$1" -v 2>/dev/null || true)"
  echo "${version#v}" | cut -d. -f1
}

load_env_file "$RUNTIME_HOME/root.env"
load_env_file "$RUNTIME_HOME/api.env"
load_env_file "$RUNTIME_HOME/web.env"

if [[ ! -f "$RUNTIME_HOME/root.env" ]]; then
  load_env_file "$ROOT/.env"
fi

if [[ ! -f "$RUNTIME_HOME/api.env" ]]; then
  load_env_file "$ROOT/apps/api/.env"
fi

if [[ ! -f "$RUNTIME_HOME/web.env" ]]; then
  load_env_file "$ROOT/apps/web/.env"
fi

export NODE_BIN="$(resolve_node_bin)"
export PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/Users/v188/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [[ "$(node_major_version "$NODE_BIN")" != "22" ]]; then
  echo "Warning: expected Node 22 runtime, but using $("$NODE_BIN" -v 2>/dev/null || echo 'unknown')." >&2
fi

artifact_missing_or_stale() {
  local artifact="$1"
  shift

  if [[ ! -f "$artifact" ]]; then
    return 0
  fi

  local candidate
  local newer_file

  for candidate in "$@"; do
    if [[ ! -e "$candidate" ]]; then
      continue
    fi

    if [[ -f "$candidate" ]]; then
      if [[ "$candidate" -nt "$artifact" ]]; then
        return 0
      fi
      continue
    fi

    newer_file="$(find "$candidate" -type f -newer "$artifact" -print -quit 2>/dev/null || true)"
    if [[ -n "$newer_file" ]]; then
      return 0
    fi
  done

  return 1
}
