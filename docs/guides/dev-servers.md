---
title: Dev Servers
order: 4
---

# Running the dev servers

`bin/devserver.sh` starts the API and the UI as background services on your machine. Each
server runs in its own session, detached from the terminal that launched it. You can close
that terminal, open a new one, or let a coding agent restart a server, and the processes
carry on.

This page assumes the one-time setup in [Install locally](./install-local.md) is done: both
`.env` files exist, dependencies are installed, the UI certificate is generated, and
Postgres is running.

## Commands

```bash
bin/devserver.sh up          # start both servers
bin/devserver.sh status      # pid and listening port for each
bin/devserver.sh logs        # follow both log files
bin/devserver.sh restart     # stop then start
bin/devserver.sh down        # stop both servers
```

Every command takes an optional second argument, `api` or `ui`, to act on one service:

```bash
bin/devserver.sh restart api
bin/devserver.sh logs ui
```

## The usual working pattern

Run `up` once, then leave a log tail open:

```bash
bin/devserver.sh up
bin/devserver.sh logs
```

Ctrl-C stops the tail. It does not stop the servers.

## Where things go

| Item | Path |
| --- | --- |
| API log | `logs/api.log` |
| UI log | `logs/ui.log` |
| Process ids | `logs/api.pid`, `logs/ui.pid` |

The whole `logs/` directory is gitignored.

The API listens on `http://localhost:3030`. The UI listens on `https://localhost`, port
443, behind the self-signed certificate you generated during setup. Your browser will warn
about that certificate the first time.

## Notifications need two more processes

`bin/devserver.sh` starts the API and the UI and nothing else. Neither the notification
worker nor a mail server is one of them, so email sent from a dev session goes nowhere
until you start both yourself.

In-app notifications need Redis and the API, and nothing more. The API writes the row and
publishes it to a per-user Redis channel, and the API process holding your browser's SSE
connection reads it back and pushes it to the page. Redis is required even when the worker
is stopped.

Email needs the notification worker and an SMTP server on top of that. The API only
enqueues a job. `api/src/notification/worker.js` is the single process that dequeues it,
renders the template, and sends the mail. MailHog is the dev SMTP server, and the API's
default config already points at `localhost:1025`.

```bash
docker compose up -d redis mailhog   # SMTP on 1025, MailHog web UI on http://localhost:8025
bin/devserver.sh up
cd api && npm run dev:worker         # leave this terminal open
```

`[Worker] Ready — waiting for jobs` is the last line of a good worker boot, and
`SMTP connection verified` above it means MailHog is reachable. `npm run dev:all` in `api/`
runs the API and the worker together in one terminal instead, if you would rather not use
`devserver.sh` for the API.

Ignore the repeated `This Redis server's default user does not require a password, but a
password was supplied` warnings. `api/.env` sets `REDIS_PASSWORD` and the dev Redis
container runs without auth.

To check the whole path at once:

```bash
cd api && npm run notify:dummy -- alert test_user@iu.edu 2
```

`test_user` is user id 2 in the seed. The email appears at http://localhost:8025 and the
in-app row appears in the `notification` table. The script does not exit when you give it a
user id, because it leaves its Redis pub/sub connections open. Both the email and the row
have already been sent by that point, so Ctrl-C is safe.

For what the notification system is and how its pieces fit together, see
[Delivery and in-app notifications](../reference/features/notifications/delivery-and-in-app-notifications.md).

## Logging in without CAS

The app normally signs you in through Indiana University's CAS. In development that is
inconvenient, and for an agent driving a browser it is impossible. Two dev-only pieces
replace it.

Visit `/dev-login` and you are signed in as `test_user`, a seeded platform admin, then sent
to the groups page. To sign in as somebody else, name them:

```
https://localhost/dev-login
https://localhost/dev-login?username=user-013
https://localhost/dev-login?username=svc_tasks
https://localhost/dev-login?username=test_user&next=/v2/datasets
```

Any active user works, so this is the way to see a page as a platform admin, a group admin,
and an ordinary member in turn. `user-013` and the other `user-0NN` accounts are seeded
members of the sample groups and hold no elevated role.

**Why this is safe.** The page calls `POST /auth/test_login`, and that route is not
registered at all when the API's `env` is `production` or `test`. The absence of the route
is the whole of the protection — the route deliberately accepts a username with no
credential. Do not add a password check and relax the environment guard; that trade is
strictly worse than what is there now. The page additionally refuses to act unless Vite is
running in dev mode.

**After a database reset, log in again.** `prisma migrate reset` re-seeds with fresh
`subject_id` values, so a browser session from before the reset points at a user that no
longer exists. Reads mostly keep working, which is what makes this confusing; writes fail
with a foreign-key error on a column such as `group_user.removed_by`. Visiting `/dev-login`
fixes it. Do not go hunting for a bug in the write path until you have re-logged in.

## Seeing a page as somebody with no privileges

<!-- cspell:ignore ajohnson sdavis ethompson -->

A platform admin sees every dataset, group, and collection whether or not a grant says so,
so checking an access-control change as `test_user` proves nothing. The seed ships three
ordinary users who hold the `user` role and belong to no group: `ajohnson`, `sdavis`, and
`ethompson`. Anything one of them can see, they can see because of a grant.

```
https://localhost/dev-login?username=ajohnson&next=/v2/datasets
```

The `user-0NN` accounts are members of the sample groups, so use one of those to check
access that comes from membership rather than from a grant.

## When to restart

Both servers reload on file changes. `nodemon` restarts the API when a `.js` file under
`api/src` changes, and Vite hot-reloads the UI. Editing application code needs no restart.

Restart for the cases reload does not cover:

- A changed `.env` or config file.
- A newly installed dependency.
- A Prisma schema change, after `npx prisma db push`.
- A process that has stopped responding.

## Startup takes about twelve seconds

The API needs roughly twelve seconds to finish booting. During that window the UI's dev
proxy has nothing to forward to, so `logs/ui.log` fills with `ECONNREFUSED` errors:

```
[vite] http proxy error at /v2/datasets/: AggregateError [ECONNREFUSED]
```

These are normal. They stop once the API logs `Listening: http://localhost:3030`.

## Checking that a server is really up

```bash
bin/devserver.sh status
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/       # expect 200
curl -s  -o /dev/null -w "%{http_code}\n" http://localhost:3030/   # expect 401
```

A `401` from the API means it is running and asking for authentication. That is a healthy
response, not an error.

`status` prints the pid from the pidfile, and that pid is nodemon rather than the API
itself. Nodemon stays alive after the process it supervises crashes, so `status` can report
`api running` while every request is refused. The port column is the reliable part: an
`api` row with no port next to it means the app inside nodemon has died. `logs/api.log`
says why, and `bin/devserver.sh restart api` clears it.

Resetting the database is the usual cause. `npx prisma migrate reset` empties the
grant-access-type table for a moment, the API validates those at startup, and it exits with
`Grant access types missing from database`. The seed restores them, but nodemon has already
stopped. Restart the API after any reset.

## Running in the foreground instead

The script is a convenience, not a requirement. To watch a single server's output directly,
stop it and run its dev script by hand:

```bash
bin/devserver.sh down api
cd api && npm run dev
```

The UI equivalent is `cd ui && npm run dev`. Nothing else in the project depends on the
script being used.

## Why not plain `nohup`

A coding agent's shell commands run in a process group that is torn down when the command
finishes, which kills anything started with `nohup ... &`. The script launches each server
through `python3` with `start_new_session=True`, placing it in its own session so that no
such cleanup reaches it. `setsid` would do the same on Linux, but macOS does not ship it.
