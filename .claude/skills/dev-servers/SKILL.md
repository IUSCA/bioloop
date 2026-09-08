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

## Logging in without CAS

Chrome DevTools MCP cannot complete a CAS login, and a minted token pushed into
`localStorage` is both fragile and refused by the permission classifier. Use the dev-only
login page instead:

```
https://localhost/dev-login                    # test_user, a seeded platform admin
https://localhost/dev-login?username=user-013  # an ordinary member of a seeded group
https://localhost/dev-login?username=<any>&next=/v2/datasets
```

It calls `POST /auth/test_login`, which accepts any active username with no credential and
is not registered when the API's `env` is `production` or `test`. That environment guard is
the entire protection; do not weaken it.

Switching users this way is how to check a page as a platform admin, a group admin, and a
plain member without three browsers.

**A stale session after a database reset looks like a bug in your change.** `prisma migrate
reset` re-seeds with new `subject_id` values. The browser keeps the old one, reads keep
working because an unknown subject simply resolves to nothing, and then a write fails with
a foreign-key violation on a column like `group_user.removed_by`. The fix is to visit
`/dev-login`, not to debug the write path. This cost a session once.

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

## `status` reports nodemon, not the app

`bin/devserver.sh status` reads the pidfile, which holds the **nodemon** process. Nodemon
survives a crash of the app it supervises and sits waiting for a file change, so `status`
happily prints `api running pid 924` while every request is refused. The listening-port
column is the honest signal: an api row with no port is a crashed app.

Read `logs/api.log`. `Listening: http://localhost:3030` is the last line of a good boot;
`[nodemon] app crashed` is the last line of a bad one. `bin/devserver.sh restart api`
clears it.

The common cause is a database change underneath a running server. `prisma migrate reset`
truncates the access-type table for a moment, and the API validates those at startup —
`Grant access types missing from database: ...` and it exits. The seed puts them back, but
nodemon has already given up. Restart after any reset.

## Talking to the database directly

`api/.env` holds the credentials, and there is no `psql` alias:

```sh
cd api && set -a && . ./.env && set +a
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" -d "$DATABASE_DB"
```

`docker compose exec postgres psql -U postgres` does not work — that role does not exist.

`psql -c` prints only the last statement's result when several are passed in one string,
so run one `-c` per query when you want to see them all.

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
