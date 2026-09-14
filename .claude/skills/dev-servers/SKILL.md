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

**A fresh DevTools browser refuses the self-signed certificate.** The first navigation fails
with `net::ERR_CERT_AUTHORITY_INVALID` and leaves a Chrome privacy-error page. Call
`type_text` with `thisisunsafe` on that page; it needs no focused element, and Chrome then
loads the original URL. Checked 2026-09-14.

It calls `POST /auth/test_login`, which accepts any active username with no credential and is
registered only in a recognised development mode — `localhost`, `docker`, or `ci`. That
environment guard is the entire protection; do not weaken it.

The guard is `isDevelopment()` in `api/src/utils/environment.js`, an allowlist over
`config.get('mode')`. It reads `mode` rather than `env` because `env` was a fixed string in
`default.json` that no environment file overrode, so every guard built on it stood open in
production. An allowlist also closes the route for a misspelled `NODE_ENV` such as `prod`,
where "not production" would have opened it. An unset `NODE_ENV` throws at startup.

Switching users this way is how to check a page as a platform admin, a group admin, and a
plain member without three browsers.

**`/dev-login` now applies a held invitation, like the real providers do.** The identity
providers apply one through `withHandledVerifyResponse` in `ui/src/stores/auth.js`;
`/dev-login` calls `POST /auth/test_login` directly and used to skip that step. The
signed-out half of the invitation flow was therefore impossible to exercise in development,
which is how a missing interstitial and a dead button went unnoticed. To drive that flow:
send an invitation, read the token out of MailHog, clear `localStorage` and
`sessionStorage` in the browser, open `/invite?token=…`, then visit
`/dev-login?username=<the invited account>`.

**A stale session after a database reset looks like a bug in your change.** `prisma migrate
reset` re-seeds with new `subject_id` values. The browser keeps the old one, reads keep
working because an unknown subject simply resolves to nothing, and then a write fails with
a foreign-key violation on a column like `group_user.removed_by`. The fix is to visit
`/dev-login`, not to debug the write path. This cost a session once.

## The named cast is seeded — use it before hunting for an account

`npm run seed` writes the fixture world the end-to-end flows are written against, so the
account for a given standing has a name and does not have to be discovered:

| Account | Standing | Use it for |
|---|---|---|
| `priya` | Platform admin | Reaching everything. Proves no policy. |
| `dana` | Admin of Midwest Genomics Center | Oversight down a branch |
| `alice` | Admin of Wong Lab | Governance actions: issue a grant, review a request |
| `bob` | Member of Wong Lab | What a plain member sees |
| `carol` | Member of Wong Sequencing | Transitivity — membership rising two levels |
| `erin` | Admin of Patel Lab | That admin authority does not travel sideways |
| `frank` | Member of Patel Lab | The outsider. Every refusal check |
| `quinn` | No group, no grant | The empty portal |

```
https://localhost/dev-login?username=alice&next=/v2/groups
```

Their world is `Midwest Genomics Center → Wong Lab → Wong Sequencing`, plus `Patel Lab` and
`Midwest Imaging Core`; the datasets are `PCM230203`, `PCM230204`, `IMG-0007`, and
`PAT-1101`, and the collection is `Aim 2 Release`. It is defined in
`api/prisma/seed_data/flows_world.js` and sits beside the sample world the seed also writes.

**These names are stable by construction**, unlike the sample world's, because the module
writes them explicitly rather than hashing. Prefer them to the queries below.

**Group and collection ids are fixed; dataset page ids are not.** The five groups are
`f1005000-0000-4000-8000-00000000000{1..5}` (Center, Wong Lab, Wong Sequencing, Patel Lab,
Imaging Core) and `Aim 2 Release` is `f1005000-0000-4000-8000-000000000101`, so
`/v2/groups/<id>` and `/v2/collections/<id>` URLs survive a reset. `/v2/datasets/:id` takes
`dataset.resource_id`, not the integer `dataset.id` — `/v2/datasets/25` renders "Failed to load
dataset". `resource_id` is a client-side `uuid()` default, so it changes on every reset;
checked 2026-09-14, `PCM230203` went from `01d99a55…` to `932a83cd…`. Look it up:
`select resource_id from dataset where name='PCM230203' and owner_group_id like 'f1005000%';`

**There is deliberately no `vic` account.** Vic is the invitee in the invitation flows, and
seeding the account would defeat the flows that exist to test inviting somebody who has none.

**`quinn`'s portal is empty of groups and collections but not of datasets.** Measured
2026-09-11: 0 groups, 0 collections, and **3 datasets**. No flows-world resource is granted to
`Public` or `Authenticated Users`, but the sample world holds five such grants, and a global
principal grant reaches everybody including an account with no memberships.

So emptiness has to be asserted against the flows world specifically — "`quinn` reaches none
of `PCM230203`, `PCM230204`, `IMG-0007`, `PAT-1101`, and no group" — rather than against the
whole portal. Removing the sample world's principal grants would make the portal absolutely
empty and would cost the only demonstration that grants to the two system principals work.

## The demo world is seeded on its own

`npm run seed:demo` writes the baseline and `api/prisma/seed_data/demo_world.js`, and
nothing else. Run it after `npx prisma migrate reset --force --skip-seed`, then restart the
API. It exists for live demos: names, profiles, and file trees read as a real center would
write them, and no sample-world grant to `Authenticated Users` surfaces an unrelated
collection. The accounts reuse the flows cast in the same roles: `dana` (center admin),
`alice` (lab admin), `bob` (member), `carol` (sub-unit member), `erin` (other lab's admin),
`frank` (outsider), and `quinn` (nothing). The Sequencing Core Facility has no admin. The
guide has the table. Because the usernames are shared, never seed this on top of `npm run seed`.

**Point `DATABASE_URL` at a scratch database, not `DATABASE_DB`.** Sourcing `api/.env`
expands `DATABASE_URL` at that moment, so a later `DATABASE_DB=other` changes nothing and the
Prisma CLI and client both keep talking to `app`. Checked 2026-09-14: a "throwaway" run
reported `No pending migrations` because it was looking at the dev database.

**Wait before reading a grant preview.** The Effective Grants Preview in the grant, request,
and review dialogs refetches about 350 ms after a change. A snapshot taken right after
clicking `Set date` still reads `expires never`, which looks like a bug and is not. Checked
2026-09-14: two seconds later it read `expires Oct 14 2026` in both the grant and review
dialogs.

**The walk leaves rows behind.** Granting, requesting, and revoking write grants, audit rows,
and notifications. Reset and re-run `npm run seed:demo` before the real demo.

## Seeing a page as somebody with no privileges

A platform admin sees every dataset, group, and collection regardless of grants, so
checking an access-control change while signed in as `test_user` proves nothing. Sign in as
somebody who belongs to no group instead — `quinn` from the table above, or an account the
queries below turn up: anything they can see, they can see because of a grant.

**Find that account, do not memorise it.** The seed assigns memberships by hashing, so which
accounts belong to nothing moves whenever the seed changes. This page named `ajohnson`,
`sdavis`, and `ethompson`; checked against a freshly seeded database, only `ajohnson` still
belonged to no group, and the other two had picked up memberships. A stale name here is
worse than no name, because the page then looks like it is proving something it is not.

```sql
-- someone with no group at all: anything they see comes from a grant
SELECT u.username FROM "user" u
 WHERE u.is_deleted = false
   AND u.subject_id NOT IN (SELECT user_id FROM group_user WHERE removed_at IS NULL)
 ORDER BY u.username LIMIT 5;

-- someone who administers a group: use for governance actions
SELECT u.username, g.name FROM "user" u
  JOIN group_user gu ON gu.user_id = u.subject_id AND gu.removed_at IS NULL
  JOIN "group" g ON g.id = gu.group_id
 WHERE gu.role = 'ADMIN' ORDER BY u.username LIMIT 5;
```

```
https://localhost/dev-login?username=<the account the query returned>&next=/v2/datasets
```

That list mixes seeded `user-0NN` accounts with the real developer accounts the seed also
creates. Either works locally; the seeded ones are the safer habit, because a name that means
something to a colleague reads as a mistake in a screenshot.

Most `user-0NN` accounts are members of a sample group, but not all — 63 of 100 were on the
database this was checked against — so pick one from the query rather than assuming. Do not
hand-insert a user for this; the seed already covers both shapes and a hand-made row
disappears at the next reset.

**A platform admin short-circuits the policy engine, not just the data filters.** `test_user`
is allowed every action before any policy runs, so a page checked as `test_user` exercises no
policy path at all. A 500 raised inside a policy's hydration is invisible to them and hits
every group admin. Check governance actions — issuing a grant, revoking one, reviewing a
request — as a group admin found by the second query above.

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

## A long automated run has to tolerate a restart

Both servers reload on a file change, which is a convenience for a person and a hazard for a
run that lasts minutes. Nodemon restarts the API whenever **anybody** saves a file under
`api/`, including another agent session working in the same checkout, and the API refuses
connections for a second or two each time. A Playwright suite that checks the API once at
startup died on four consecutive runs this way while the server itself was healthy: `curl`
answered `200` throughout, and the pid seen by `lsof` had already been replaced seconds later.

Vite is the other half. It compiles a route the first time somebody asks for it, so the first
navigation of a run can take tens of seconds while every later one takes under a second. That
cost lands on whichever test runs first and reads as that test being slow.

So an automated run should warm both servers once before it starts, and should retry the API
heartbeat rather than take a single refusal as proof the server is down. A run that must not
be disturbed at all is the case for `bin/devserver.sh` over an editor-driven reload: stop
editing `api/` while it runs.

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
