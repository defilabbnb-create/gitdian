#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/Users/v188/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/v188"

ROOT="/Users/v188/Documents/gitdian"
RUNTIME_HOME="${HOME}/Library/Application Support/gitdian"
LOG_DIR="/Users/v188/Library/Logs/gitdian"
SERVICE_NAME="${GITDIAN_SERVICE_NAME:-generic}"

typeset -ga LOADED_ENV_FILES=()

load_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    set -a
    source "$env_file"
    set +a
    LOADED_ENV_FILES+=("$env_file")
  fi
}

mkdir -p "$LOG_DIR"

load_root_env() {
  if [[ -f "$RUNTIME_HOME/root.env" ]]; then
    load_env_file "$RUNTIME_HOME/root.env"
    return 0
  fi

  load_env_file "$ROOT/.env"
  return 1
}

load_service_env() {
  local service_name="$1"
  local runtime_env="$RUNTIME_HOME/${service_name}.env"
  local repo_env=""

  case "$service_name" in
    api)
      repo_env="$ROOT/apps/api/.env"
      ;;
    web)
      repo_env="$ROOT/apps/web/.env"
      ;;
    worker)
      repo_env="$ROOT/apps/api/.env"
      ;;
    *)
      echo "Unknown gitdian service env: $service_name" >&2
      return 1
      ;;
  esac

  if [[ -f "$runtime_env" ]]; then
    load_env_file "$runtime_env"
    return
  fi

  if [[ -n "$repo_env" ]]; then
    load_env_file "$repo_env"
  fi
}

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

append_node_option() {
  local option="$1"

  if [[ " ${NODE_OPTIONS:-} " == *" ${option} "* ]]; then
    return
  fi

  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }${option}"
}

ensure_node_heap_limit() {
  local heap_mb
  heap_mb="${NODE_MAX_OLD_SPACE_SIZE_MB:-8192}"

  if ! [[ "$heap_mb" =~ ^[0-9]+$ ]] || (( heap_mb < 1024 )); then
    heap_mb="8192"
  fi

  append_node_option "--max-old-space-size=${heap_mb}"
}

log_runtime_summary() {
  local loaded_envs="none"
  local node_version

  node_version="$("$NODE_BIN" -v 2>/dev/null || echo 'unknown')"

  if (( ${#LOADED_ENV_FILES[@]} > 0 )); then
    loaded_envs="${(j:,:)LOADED_ENV_FILES}"
  fi

  echo "Runtime env ready service=${SERVICE_NAME} node=${node_version} loadedEnvFiles=${loaded_envs} nodeOptions=${NODE_OPTIONS:-} queueWorkers=${ENABLE_QUEUE_WORKERS:-unset} continuousRadar=${ENABLE_CONTINUOUS_RADAR:-unset} intake=${GITHUB_NEW_REPOSITORY_INTAKE_ENABLED:-unset} openaiMaxConcurrency=${OPENAI_MAX_CONCURRENCY:-unset} snapshotConcurrency=${IDEA_SNAPSHOT_CONCURRENCY:-unset} deepConcurrency=${DEEP_ANALYSIS_CONCURRENCY:-unset}"
}

load_root_env

case "$SERVICE_NAME" in
  api | web | worker)
    load_service_env "$SERVICE_NAME"
    ;;
esac

export NODE_BIN="$(resolve_node_bin)"
export PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/Users/v188/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ensure_node_heap_limit

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
