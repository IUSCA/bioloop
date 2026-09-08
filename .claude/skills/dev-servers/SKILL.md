---
name: dev-servers
description: How to start, stop, restart, and read the logs of the local API and UI dev servers with bin/devserver.sh, so that a human terminal and an agent session control the same processes. Use whenever the running app is needed - verifying a change in the browser, driving Chrome DevTools MCP, reading server logs, or recovering a wedged server.
---

# Running the local dev servers

`bin/devserver.sh` starts the API and the UI detached from whoever launched them. A human
terminal and an agent session are then both clients of the same two processes, so either
can restart a server and read its logs.

The user-facing version of this page is
[docs/guides/dev-servers.md](../../../docs/guides/dev-servers.md).

## Commands

```
bin/devserver.sh up | down | restart | status | logs   [api|ui]
```

The second argument is optional and defaults to both services.

- `status` prints each service's pid and its listening port.
- `logs` follows both log files. Ctrl-C stops the tail and leaves the servers running.

Logs go to `logs/api.log` and `logs/ui.log`, pids to `logs/<name>.pid`. The whole `logs/`
directory is gitignored. The API listens on `http://localhost:3030` and the UI on
`https://localhost`, port 443, behind a self-signed certificate.

## Start servers this way, never with a bare `npm run dev`

A process started with `nohup ... &` inside a tool call is killed when that call ends,
because the harness tears down the process group. The script sidesteps this by launching
through `python3` with `start_new_session=True`, which puts each server in its own
session. Nothing in the harness's cleanup path reaches it.

`setsid` is not available on macOS, which is why the script uses `python3` rather than the
one-line shell form.

## Restart only when reload cannot cover it

Both servers reload on file changes: `nodemon` for the API, Vite HMR for the UI. Editing a
`.vue` or `.js` file needs no restart. Restart for a changed `.env` or config file, a new
dependency, or a process that has stopped responding.

## The twelve-second boot window

The API takes about twelve seconds to finish booting. Until it does, `ui.log` fills with
`ECONNREFUSED` proxy errors from the Vite dev proxy, because the UI is proxying API calls
to a port nothing is listening on yet. Those lines are the normal startup window.

Confirm a server is actually up before reading a log as a fault:

```bash
bin/devserver.sh status
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/          # expect 200
curl -s  -o /dev/null -w "%{http_code}\n" http://localhost:3030/      # expect 401
```

A `401` from the API means it is alive and demanding authentication. Treat it as success,
not as a failure to reach the server.

## Traps

- `lsof` ORs its filters unless you pass `-a`. `lsof -nP -p "$pid" -iTCP` prints every
  open file the process holds, not just its sockets.
- The listening socket belongs to a child of the pid in the pidfile, because `npm run dev`
  wraps `nodemon` or `vite`. Query the process group with `lsof -g "$pid"`, not `-p`.
- `stop` signals the negative pid, which reaches the whole session and so catches those
  children. Signalling the pidfile's pid alone orphans them and leaves the port bound.

## Keeping this current

When a session hits something this page does not mention - a new failure mode, a port that
moved, a startup message worth recognising - amend this file and
[docs/guides/dev-servers.md](../../../docs/guides/dev-servers.md) in the same change.
Verify a claim against the running system before writing it down here.
