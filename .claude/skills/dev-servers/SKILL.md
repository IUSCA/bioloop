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

It does not manage the Python workers. Those are three pm2 processes, and celery, the
watch script, and the upload cron are covered by
[.claude/skills/workers-dev](../workers-dev/SKILL.md).

## Commands

```
bin/devserver.sh up | down | restart | status | logs   [api|ui|notifications-worker ...]
```

The trailing arguments are optional and default to all three services.
`notifications-worker` is the notification email worker; see below.

- `status` prints each service's pid and its listening port.
- `logs` follows both log files. Ctrl-C stops the tail and leaves the servers running.

Logs go to `logs/<name>.log`, pids to `logs/<name>.pid`. The whole `logs/` directory is
gitignored. The API listens on `http://localhost:3030` and the UI on `https://localhost`,
port 443, behind a self-signed certificate. The worker listens on nothing, so its `status`
row has no port and that is not a fault.

## Start servers this way, never with a bare `npm run dev`

A process started with `nohup ... &` inside a tool call is killed when that call ends,
because the harness tears down the process group. The script sidesteps this by launching
through `python3` with `start_new_session=True`, which puts each server in its own
session. Nothing in the harness's cleanup path reaches it.

`setsid` is not available on macOS, which is why the script uses `python3` rather than the
one-line shell form.

## Notifications need Redis, MailHog, and the worker

`bin/devserver.sh up` starts the worker along with the API and the UI, but no mail server,
and it does not touch Docker. Email sent from a dev session goes nowhere until Redis and an
SMTP server are up as well.

**In-app notifications need Redis and the API, and that is all.** The row is written by
`InAppNotificationService.create`, which then publishes it to a per-user Redis channel.
The API process holding the browser's SSE connection reads it back off that channel and
pushes it to the browser. Redis is therefore required even with the worker stopped.

**Email additionally needs the notification worker and an SMTP server.** The API only
enqueues a Bull job. `api/src/notification/worker.js` is the one process that calls
`queue.process()`, renders the template, and sends the mail. MailHog is the dev SMTP
server, and the API's default config already points at `localhost:1025`.

```bash
docker compose up -d redis mailhog   # 6379 and 1025, MailHog UI on 8025
bin/devserver.sh up                  # all three
```

`bin/devserver.sh up notifications-worker` starts the worker alone, and `restart worker` and `logs worker`
act on it without touching the API.

`[Worker] Ready — waiting for jobs` in `logs/notifications-worker.log` is the last line of a good boot.
`SMTP connection verified` above it means MailHog is reachable.

The repeated `This Redis server's default user does not require a password, but a password
was supplied` warnings are normal. `api/.env` sets `REDIS_PASSWORD` and the dev container
runs without auth. They are not a fault.

`npm run dev:all` in `api/` runs the API and the worker together in one foreground terminal.
It is an alternative to `devserver.sh`, not an addition to it; running both gives you two
workers competing for the same queues.

## Checking the whole notification path in one command

```bash
cd api && npm run notify:dummy -- alert test_user@iu.edu 2
```

`test_user` is user id 2 in the seed. The email lands in MailHog and the in-app row lands
in the `notification` table:

```bash
curl -s http://localhost:8025/api/v2/messages | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])"
```

**The script does not exit when you pass a `userId`.** It leaves the two `ioredis` pub/sub
connections open, so it hangs after the send. Both the email and the row have already been
delivered by then, and Ctrl-C is safe. Filed in `.todo/issues/05-notifications.md`.

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

## Seeing a page as somebody with no privileges

A platform admin sees every dataset, group, and collection regardless of grants, so
checking an access-control change while signed in as `test_user` proves nothing. The seed
ships three ordinary users who hold the `user` role and belong to no group at all:
`ajohnson`, `sdavis`, and `ethompson`. Anything one of them can see, they can see because
of a grant.

```
https://localhost/dev-login?username=ajohnson&next=/v2/datasets
```

The `user-0NN` accounts are members of the sample groups, so use those to check
membership-derived access instead. Do not hand-insert a user for this; the seed already
covers both shapes and a hand-made row disappears at the next reset.

**A platform admin short-circuits the policy engine, not just the data filters.** `test_user`
is allowed every action before any policy runs, so a page checked as `test_user` exercises no
policy path at all. A 500 raised inside a policy's hydration is invisible to them and hits
every group admin. Check governance actions — issuing a grant, revoking one, reviewing a
request — as a group admin such as `user-054`.

**Chrome DevTools MCP cannot attach while another Chrome holds its profile.** It reports
"The browser is already running for `~/.cache/chrome-devtools-mcp/chrome-profile`" and cannot
launch its own. Quit that Chrome window and the next call starts a fresh browser.

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
