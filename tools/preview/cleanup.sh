#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
if [ -f "$PREVIEW_STATE_DIR/tunnel.pid" ]; then
  pid="$(cat "$PREVIEW_STATE_DIR/tunnel.pid")"
  # Check ownership by command and executable path before signalling a saved PID.
  if [[ "$pid" =~ ^[0-9]+$ ]] && [ "$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)" = "$PREVIEW_STATE_DIR/cloudflared" ]; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..10}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    if [ "$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)" = "$PREVIEW_STATE_DIR/cloudflared" ]; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PREVIEW_STATE_DIR/tunnel.pid"
fi
if [ -f "$PREVIEW_STATE_DIR/api.env" ]; then
  timeout --signal=TERM --kill-after=10s 90s docker compose --env-file /dev/null \
    --project-name "$COMPOSE_PROJECT_NAME" --file "$PREVIEW_TOOLS_DIR/../../docker-compose-preview.yml" \
    down --volumes --remove-orphans --timeout 10
fi
