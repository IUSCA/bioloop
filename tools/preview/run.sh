#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
umask 077
mkdir -p "$PREVIEW_STATE_DIR"
started_epoch="$(date +%s)"
finish() {
  status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    python3 "$PREVIEW_TOOLS_DIR/diagnostics.py" || true
    if [ -f "$PREVIEW_STATE_DIR/diagnostics.txt" ]; then
      cat "$PREVIEW_STATE_DIR/diagnostics.txt"
    fi
  fi
  bash "$PREVIEW_TOOLS_DIR/cleanup.sh" || true
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '\nPreview stopped at %s (exit %s). The URL is no longer active.\n' "$(date -u +%FT%TZ)" "$status" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

duration="${PREVIEW_DURATION:-60}"
case "$duration" in 30|60|120) ;; *) echo 'Invalid preview duration' >&2; exit 1 ;; esac
python3 - <<'PY'
import os, re
emails = os.environ.get('PREVIEW_ALLOWED_EMAILS', '').split(',')
assert 1 <= len(emails) <= 20
assert all(re.fullmatch(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', value) for value in emails), 'Configure specific PREVIEW_ALLOWED_EMAILS'
PY

timeout --signal=TERM --kill-after=30s 45m bash "$PREVIEW_TOOLS_DIR/start.sh"
readarray -t tunnel < <(python3 - "$PREVIEW_TOOLS_DIR/dependencies.json" <<'PY'
import json, sys
spec = json.load(open(sys.argv[1]))['cloudflared']
print(spec['url'])
print(spec['sha256'])
PY
)
curl --fail --silent --show-error --location --max-time 90 "${tunnel[0]}" -o "$PREVIEW_STATE_DIR/cloudflared"
printf '%s  %s\n' "${tunnel[1]}" "$PREVIEW_STATE_DIR/cloudflared" | sha256sum --check --status
chmod 700 "$PREVIEW_STATE_DIR/cloudflared"
"$PREVIEW_STATE_DIR/cloudflared" tunnel --help > "$PREVIEW_STATE_DIR/tunnel-help.txt"
grep -q -- --allowed-mail "$PREVIEW_STATE_DIR/tunnel-help.txt"
"$PREVIEW_STATE_DIR/cloudflared" tunnel --no-autoupdate --url http://127.0.0.1:8080 \
  --allowed-mail "$PREVIEW_ALLOWED_EMAILS" > "$PREVIEW_STATE_DIR/tunnel.log" 2>&1 &
tunnel_pid=$!
echo "$tunnel_pid" > "$PREVIEW_STATE_DIR/tunnel.pid"
url=''
for _ in {1..60}; do
  kill -0 "$tunnel_pid" 2>/dev/null || { echo 'Protected tunnel exited' >&2; exit 1; }
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$PREVIEW_STATE_DIR/tunnel.log" | head -1 || true)"
  [ -z "$url" ] || break
  sleep 2
done
[[ "$url" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]] || { echo 'No protected preview URL' >&2; exit 1; }
python3 "$PREVIEW_TOOLS_DIR/configure.py" public-url "$url"
compose up -d --no-deps --wait --wait-timeout 60 api
# nginx resolves service names at startup; refresh it after API recreation.
compose up -d --no-deps --force-recreate --wait --wait-timeout 60 ui
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8080/api/health > /dev/null
# DNS/edge propagation is bounded; any response that exposes the app fails closed.
verified=false
for _ in {1..12}; do
  if python3 "$PREVIEW_TOOLS_DIR/check-ingress.py" "$url" > "$PREVIEW_STATE_DIR/ingress-check.log" 2>&1; then
    verified=true; break
  fi
  sleep 5
done
[ "$verified" = true ] || { echo 'Protected ingress could not be verified' >&2; exit 1; }
[ "$(( $(date +%s) - started_epoch ))" -le 3000 ] || { echo 'Readiness exceeded the 50-minute budget' >&2; exit 1; }

ready="$(date -u +%FT%TZ)"
expires="$(date -u -d "+${duration} minutes" +%FT%TZ)"
deadline=$(( $(date +%s) + duration * 60 ))
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '## BioLoop Preview — PR #%s\n\n' "$PREVIEW_PR"
    printf 'Commit: `%s`\n\n' "$PREVIEW_SHA"
    printf 'Preview: %s\n\n' "$url"
    printf 'Ready: %s · Expires: %s · Review period: %s minutes\n\n' "$ready" "$expires" "$duration"
    printf 'Authenticate with your approved email, then choose a synthetic demo role:\n\n'
    for role in admin operator user; do printf -- '- [%s](%s/auth/iucas?ticket=%s)\n' "$role" "$url" "$role"; done
    printf '\nStop early with **Cancel workflow**. Data is synthetic and disappears on shutdown.\n'
  } >> "$GITHUB_STEP_SUMMARY"
fi
echo "Preview ready: PR #${PREVIEW_PR}, commit ${PREVIEW_SHA}, expires ${expires}. See the job summary for the URL."
services=(postgres signet_db mongo queue rhythm signet api secure_download celery_worker watch upload_poller ui)
while [ "$(date +%s)" -lt "$deadline" ]; do
  kill -0 "$tunnel_pid" 2>/dev/null || { echo 'Tunnel stopped early' >&2; exit 1; }
  for service in "${services[@]}"; do
    cid="$(compose ps -q "$service")"
    [ -n "$cid" ] || { echo "Service exited: $service" >&2; exit 1; }
    status="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid")"
    [[ "$status" == running* && "$status" != *unhealthy* ]] || { echo "Service failed: $service" >&2; exit 1; }
  done
  remaining=$(( deadline - $(date +%s) ))
  [ "$remaining" -le 0 ] || sleep "$((remaining < 15 ? remaining : 15))"
done
