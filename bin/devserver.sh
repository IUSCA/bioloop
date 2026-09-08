#!/bin/bash
#
# devserver.sh
#
# Starts, stops, and restarts the API and UI dev servers so that both a human
# terminal and an AI agent session can control the same processes.
#
# Each server runs in its own session (setsid), detached from the shell that
# launched it, writing to logs/<name>.log with its pid in logs/<name>.pid.
# Nothing dies when the launching terminal or tool call exits.
#
#   bin/devserver.sh up [api|ui]        start (no-op if already running)
#   bin/devserver.sh down [api|ui]      stop
#   bin/devserver.sh restart [api|ui]   stop then start
#   bin/devserver.sh status             what is running, on which pid
#   bin/devserver.sh logs [api|ui]      follow the logs (ctrl-c is safe)
#
# Both servers already reload on file changes, so restart is only for the cases
# reload does not cover: a changed .env, a new dependency, a wedged process.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

svc_dir()  { case "$1" in api) echo "$ROOT/api";; ui) echo "$ROOT/ui";; esac; }
pidfile()  { echo "$LOGDIR/$1.pid"; }
logfile()  { echo "$LOGDIR/$1.log"; }

# Print the pid if the service is running, otherwise nothing.
running_pid() {
  local f; f="$(pidfile "$1")"
  [ -f "$f" ] || return 1
  local pid; pid="$(cat "$f")"
  kill -0 "$pid" 2>/dev/null || { rm -f "$f"; return 1; }
  echo "$pid"
}

start_one() {
  local name="$1" pid
  if pid="$(running_pid "$name")"; then
    echo "$name already running (pid $pid)"
    return 0
  fi
  # start_new_session detaches the child from this shell's process group, so it
  # survives the terminal or agent tool call that started it.
  python3 - "$(logfile "$name")" "$(pidfile "$name")" "$(svc_dir "$name")" npm run dev <<'PY'
import os, subprocess, sys
log, pidfile, cwd, *cmd = sys.argv[1:]
out = open(log, "ab", buffering=0)
p = subprocess.Popen(cmd, cwd=cwd, stdout=out, stderr=subprocess.STDOUT,
                     stdin=subprocess.DEVNULL, start_new_session=True)
open(pidfile, "w").write(str(p.pid))
PY
  sleep 1
  if pid="$(running_pid "$name")"; then
    echo "$name started (pid $pid) -> logs/$name.log"
  else
    echo "$name failed to start; last lines of logs/$name.log:"
    tail -20 "$(logfile "$name")"
    return 1
  fi
}

stop_one() {
  local name="$1" pid
  if ! pid="$(running_pid "$name")"; then
    echo "$name not running"
    return 0
  fi
  # Negative pid signals the whole session, which catches nodemon/vite children.
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.25
  done
  kill -KILL -"$pid" 2>/dev/null
  rm -f "$(pidfile "$name")"
  echo "$name stopped"
}

status_one() {
  local name="$1" pid
  if pid="$(running_pid "$name")"; then
    echo "$name  running  pid $pid  $(lsof -nP -a -g "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $10}' | tr '\n' ' ')"
  else
    echo "$name  stopped"
  fi
}

cmd="${1:-status}"
targets="${2:-api ui}"

case "$cmd" in
  up|start)   for s in $targets; do start_one "$s"; done ;;
  down|stop)  for s in $targets; do stop_one "$s"; done ;;
  restart)    for s in $targets; do stop_one "$s"; start_one "$s"; done ;;
  status)     for s in $targets; do status_one "$s"; done ;;
  logs)       # shellcheck disable=SC2046
              tail -n 50 -f $(for s in $targets; do logfile "$s"; done) ;;
  *)          echo "usage: bin/devserver.sh {up|down|restart|status|logs} [api|ui]" >&2; exit 2 ;;
esac
