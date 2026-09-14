---
title: Dev Servers
order: 4
---

# Running the dev servers

`bin/devserver.sh` starts the API, the UI, and the notification worker as background
services on your machine. Each one runs in its own session, detached from the terminal that
launched it. You can close that terminal, open a new one, or let a coding agent restart a
service, and the processes carry on.

This page assumes the one-time setup in [Install locally](./install-local.md) is done: both
`.env` files exist, dependencies are installed, the UI certificate is generated, and
Postgres is running.

## Commands

```bash
bin/devserver.sh up          # start all three services
bin/devserver.sh status      # pid and listening port for each
bin/devserver.sh logs        # follow all three log files
bin/devserver.sh restart     # stop then start
bin/devserver.sh down        # stop all three services
```

Every command takes optional service names — `api`, `ui`, `notifications-worker`, or several — to act on
a subset:

```bash
bin/devserver.sh restart api
bin/devserver.sh logs notifications-worker
bin/devserver.sh up api ui
```

`notifications-worker` is the notification email worker described below. The Python celery workers are a
separate system, managed with pm2 rather than this script.

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
| Notification worker log | `logs/notifications-worker.log` |
| Process ids | `logs/<name>.pid` |

The whole `logs/` directory is gitignored.

<!-- cSpell: ignore thisisunsafe -->

The API listens on `http://localhost:3030`. The UI listens on `https://localhost`, port
443, behind the self-signed certificate you generated during setup. Your browser will warn
about that certificate the first time. A browser driven by Chrome DevTools MCP stops on the
same warning with `net::ERR_CERT_AUTHORITY_INVALID`. Typing `thisisunsafe` on the warning
page loads the site.

## Notifications need Redis, MailHog, and the worker

`bin/devserver.sh up` starts the notification worker along with the API and the UI, but it
does not touch Docker. Email sent from a dev session goes nowhere until Redis and an SMTP
server are running as well.

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
bin/devserver.sh up                  # all three
```

`[Worker] Ready — waiting for jobs` in `logs/notifications-worker.log` is the last line of a good worker
boot, and `SMTP connection verified` above it means MailHog is reachable. The worker listens
on no port, so its `status` row shows a pid and nothing else.

`bin/devserver.sh restart notifications-worker` and `bin/devserver.sh logs notifications-worker` act on the worker alone,
which is what you want when you are editing templates or the send path. `npm run dev:all` in
`api/` runs the API and the worker together in one terminal instead, if you would rather not
use `devserver.sh` at all — do not run both, or two workers will compete for the same queues.

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

**Why this is safe.** The page calls `POST /auth/test_login`, and that route is registered
only when the API is running in a recognised development mode: `localhost`, `docker`, or
`ci`. The absence of the route is the whole of the protection — the route deliberately
accepts a username with no credential. Do not add a password check and relax the environment
guard; that trade is strictly worse than what is there now. The page additionally refuses to
act unless Vite is running in dev mode.

The check is `isDevelopment()` in `api/src/utils/environment.js`, and it is an allowlist on
purpose. A deployment whose `NODE_ENV` is misspelled — `prod` rather than `production` —
loads no environment config file, so a rule phrased as "not production" would hold and the
route would appear. Phrased as an allowlist, the same misspelling removes the route instead.
An unset `NODE_ENV` throws at startup rather than picking a side.

`/dev-login` also spends an invitation token the browser is holding, so the whole
invitation flow can be walked in development: send one, take the link from MailHog, clear
the browser's storage, open the link, and sign in as the invited account.

**After a database reset, log in again.** `prisma migrate reset` re-seeds with fresh
`subject_id` values, so a browser session from before the reset points at a user that no
longer exists. Reads mostly keep working, which is what makes this confusing; writes fail
with a foreign-key error on a column such as `group_user.removed_by`. Visiting `/dev-login`
fixes it. Do not go hunting for a bug in the write path until you have re-logged in.

## The demo world

`npm run seed:demo` in `api/` writes the baseline and one realistic research center, and
nothing else. Use it for a live demo: no sample-world collection or fixture prose shows up on
any page.

Run it on an empty database, then restart the API:

```bash
cd api
npx prisma migrate reset --force --skip-seed
npm run seed:demo
cd .. && bin/devserver.sh restart api
```

The center is `Center for Precision Health Research`. Every account holds the plain `user`
role, so each page shows what the access model decides:

| Account | Standing |
|---|---|
| `dana` | Admin of the center; oversight of every lab |
| `alice` | Admin of Wong Cancer Genomics Lab and its Tumor Sequencing Unit |
| `bob` | Member of Wong Cancer Genomics Lab |
| `carol` | Member of Tumor Sequencing Unit |
| `erin` | Admin of Vasquez Neuroimaging Lab |
| `frank` | Member of Vasquez Neuroimaging Lab, the outsider who requests access |
| `quinn` | No group and no grant |

The usernames are the flows world's cast, in the same roles. The two worlds share those
usernames, so seed one or the other into a database, never both.

The collection most demos use is `BRCA Cohort Release 1`, at
`/v2/collections/de300000-0000-4000-8000-000000000101`. Group and collection ids are fixed.
Dataset pages take `dataset.resource_id`, which changes on every reset, so look it up.

`npm run seed` does not write this world. To go back to the development data, reset and run
`npm run seed`.

## Seeing a page as somebody with no privileges

<!-- cspell:ignore ajohnson sdavis ethompson -->

A platform admin sees every dataset, group, and collection whether or not a grant says so,
so checking an access-control change as `test_user` proves nothing. Sign in as somebody who
belongs to no group instead. Anything they can see, they can see because of a grant.

The seed decides memberships by hashing, so the accounts that belong to nothing change
whenever the seed changes, and naming one here would go stale. Ask the database:

```sql
SELECT u.username FROM "user" u
 WHERE u.is_deleted = false
   AND u.subject_id NOT IN (SELECT user_id FROM group_user WHERE removed_at IS NULL)
 ORDER BY u.username LIMIT 5;
```

```
https://localhost/dev-login?username=<the account that query returned>&next=/v2/datasets
```

That list mixes seeded `user-0NN` accounts with the real developer accounts the seed also
creates. Either works locally; the seeded ones are the safer habit, because a name that means
something to a colleague reads as a mistake in a screenshot.

Most `user-0NN` accounts belong to a sample group, so one of those is the way to check access
that comes from membership rather than from a grant — but a third of them belong to no group,
so confirm rather than assume.

**A platform admin short-circuits the policy engine, not just the data filters.** `test_user`
is allowed every action before any policy runs, so a page checked as `test_user` exercises no
policy path at all. A 500 raised inside a policy's own attribute loading is invisible to them
and hits every group admin. Check governance actions — issuing a grant, revoking one,
reviewing a request — as a group admin such as `user-054`.

**Chrome DevTools MCP cannot attach while another Chrome holds its profile.** It reports
"The browser is already running for `~/.cache/chrome-devtools-mcp/chrome-profile`" and cannot
launch its own. Quit that Chrome window and the next call starts a fresh browser.

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

## A long automated run has to tolerate a restart

Reloading is a convenience for a person and a hazard for a run that lasts minutes. Nodemon
restarts the API whenever anybody saves a file under `api/`, including another session sharing
the checkout, and the API refuses connections for a second or two each time. Vite compiles a
route the first time it is asked for, so the first page load of a run can take tens of seconds
while every later one takes under a second.

A test suite or any other automated run should therefore warm both servers once before it
starts and retry the API heartbeat rather than treat one refused connection as a server that
is down. If a run must not be disturbed, avoid editing `api/` while it is going.

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

**A platform admin short-circuits the policy engine, not just the data filters.** `test_user`
is allowed every action before any policy runs, so a page checked as `test_user` exercises no
policy path at all. A 500 raised inside a policy's hydration is invisible to them and hits
every group admin. Check governance actions — issuing a grant, revoking one, reviewing a
request — as a group admin such as `user-054`.

**Chrome DevTools MCP cannot attach while another Chrome holds its profile.** It reports
"The browser is already running for `~/.cache/chrome-devtools-mcp/chrome-profile`" and cannot
launch its own. Quit that Chrome window and the next call starts a fresh browser.
