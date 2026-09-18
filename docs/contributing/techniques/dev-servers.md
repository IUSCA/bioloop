---
title: Dev servers for agents and checks
---

# Dev servers for agents and checks

This page is the reference half of the `dev-servers` agent skill. It covers the seeded
accounts, the database, and the process details an automated session needs.
[Dev servers](../../guides/dev-servers.md) is the user guide and covers everything else. That
includes the commands, log paths, notifications, `/dev-login`, the demo world, restarts, and
the boot window. This page does not repeat it.

The Python workers are separate. The `workers-dev` skill covers celery, the watch script, and
the upload cron under pm2.

## How the script survives a tool call

A process started with `nohup ... &` inside an agent's tool call dies when that call ends,
because the harness tears down the process group. `bin/devserver.sh` launches each service
through `python3` with `subprocess.Popen(..., start_new_session=True)`. Each service then
runs in its own session, which the harness's cleanup does not reach. macOS ships no `setsid`,
so the script cannot use the one-line shell form.

The script accepts `api`, `ui`, and `notifications-worker` as names. Any other name exits with
`unknown service`. `up` and `start` are synonyms, and so are `down` and `stop`.

### Process details

- The pidfile holds the pid of `npm run dev`. The listening socket belongs to a child, `nodemon`
  or `vite`. Query the process group with `lsof -g "$pid"`, not `lsof -p`.
- `lsof` ORs its filters unless you pass `-a`. `lsof -nP -p "$pid" -iTCP` prints every open file
  the process holds, not just its sockets.
- `down` sends `SIGTERM` to the negative pid, which reaches the whole session and its children.
  After five seconds it sends `SIGKILL`. Signalling the pidfile's pid alone orphans the children
  and leaves the port bound.
- `status` reports the nodemon process, so it can print `api running` while the app inside has
  crashed. An `api` row with no port is a crashed app. `logs/api.log` ends with
  `Listening: http://localhost:3030` after a good boot and `[nodemon] app crashed` after a bad
  one.
- The API validates grant access types at startup. `prisma migrate reset` empties that table
  for a moment, so a running API exits with `Grant access types missing from database`. Nodemon
  does not retry. Run `bin/devserver.sh restart api` after any reset.

### A long automated run

Nodemon restarts the API whenever anybody saves a file under `api/`, including another agent
session in the same checkout. The API then refuses connections for a second or two. A
Playwright suite that checked the API once at startup failed repeatedly this way while `curl`
answered `200` throughout. Vite compiles a route on first request, so the first navigation of a
run can take tens of seconds.

An automated run should warm both servers once before it starts. It should retry the API
heartbeat rather than treat one refusal as a dead server. A run that must not be disturbed
needs nobody editing `api/` while it goes.

## The seeded cast

`npm run seed` writes the fixture world the end-to-end flows use, from
`api/prisma/seed_data/flows_world.js`. It sits beside the sample world the seed also writes.
The names are stable, because the module writes them explicitly rather than hashing.

| Account | Standing | Use it for |
|---|---|---|
| `priya` | Platform admin | Reaching everything. Proves no policy. |
| `dana` | Admin of Midwest Genomics Center | Oversight down a branch |
| `alice` | Admin of Wong Lab | Governance actions: issue a grant, review a request |
| `bob` | Member of Wong Lab | What a plain member sees |
| `carol` | Member of Wong Sequencing | Membership rising two levels |
| `erin` | Admin of Patel Lab | Admin authority does not travel sideways |
| `frank` | Member of Patel Lab | The outsider, for every refusal check |
| `quinn` | No group, no grant | The empty portal |

The world is `Midwest Genomics Center → Wong Lab → Wong Sequencing`, plus `Patel Lab` and
`Midwest Imaging Core`. The datasets are `PCM230203`, `PCM230204`, `IMG-0007`, and `PAT-1101`.
The collection is `Aim 2 Release`.

There is no `vic` account on purpose. Vic is the invitee in the invitation flows, and those flows
test inviting somebody who has no account.

### Fixed and unfixed ids

The five groups are `f1005000-0000-4000-8000-00000000000{1..5}`, in the order Center, Wong Lab,
Wong Sequencing, Patel Lab, and Imaging Core. `Aim 2 Release` is
`f1005000-0000-4000-8000-000000000101`. So `/v2/groups/<id>` and `/v2/collections/<id>` URLs
survive a reset.

`/v2/datasets/:id` takes `dataset.resource_id`, not the integer `dataset.id`. The integer renders
"Failed to load dataset". `resource_id` is a client-side `uuid()` default, so it changes on every
reset. `PCM230203` is also a sample-world dataset name, so filter by owning group:

```sql
select resource_id from dataset where name='PCM230203' and owner_group_id like 'f1005000%';
```

### `quinn` still sees datasets

`quinn` reaches no group and no collection, but does reach some sample-world datasets. The sample
world grants several resources to `Public` or `Authenticated Users`. A grant to a system principal
reaches everybody, including an account with no memberships. Assert emptiness against the flows
world specifically: `quinn` reaches none of `PCM230203`, `PCM230204`, `IMG-0007`, or `PAT-1101`,
and no group.

### Finding other accounts

Sample-world memberships are assigned by hashing, so any account name picked from them goes stale
when the seed changes. Query rather than memorise:

```sql
-- someone with no group at all: anything they see comes from a grant
SELECT u.username FROM "user" u
 WHERE u.is_deleted = false
   AND u.subject_id NOT IN (SELECT user_id FROM group_user WHERE removed_at IS NULL)
 ORDER BY u.username LIMIT 5;

-- someone who administers a group
SELECT u.username, g.name FROM "user" u
  JOIN group_user gu ON gu.user_id = u.subject_id AND gu.removed_at IS NULL
  JOIN "group" g ON g.id = gu.group_id
 WHERE gu.role = 'ADMIN' ORDER BY u.username LIMIT 5;
```

Do not hand-insert a user for a check. The seed already covers both shapes, and a hand-made row
disappears at the next reset.

## The demo world

The [user guide](../../guides/dev-servers.md#the-demo-world) describes `npm run seed:demo`. Three
operational facts sit beside it.

- **Point `DATABASE_URL` at a scratch database, not `DATABASE_DB`.** Sourcing `api/.env` expands
  `DATABASE_URL` at that moment. A later `DATABASE_DB=other` changes nothing, and the Prisma CLI
  and client keep talking to `app`. A supposedly throwaway run once reported
  `No pending migrations` because it was reading the dev database.
- **Wait before reading a grant preview.** The Effective Grants Preview in the grant, request, and
  review dialogs fetches again about 350 ms after a change. A snapshot right after `Set date` still
  reads `expires never`. Two seconds later it shows the date.
- **A walk-through leaves rows behind.** Granting, requesting, and revoking write grants, audit
  rows, and notifications. Reset and re-run `npm run seed:demo` before a real demo.

The demo world has no `test_user` and no platform admin. `dev-login` refuses `priya` and
`test_user` there.

## Walking the signed-out invitation flow

`/dev-login` applies a held invitation token, as the real identity providers do through
`withHandledVerifyResponse` in `ui/src/stores/auth.js`. To walk the flow:

1. Send an invitation.
2. Read the token out of MailHog at `http://localhost:8025`.
3. Clear `localStorage` and `sessionStorage` in the browser.
4. Open `/invite?token=…`.
5. Visit `/dev-login?username=<the invited account>`.

## Talking to the database directly

`api/.env` holds the credentials, and there is no `psql` alias:

```sh
cd api && set -a && . ./.env && set +a
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" -d "$DATABASE_DB"
```

`docker compose exec postgres psql -U postgres` does not work, because that role does not exist.

`psql -c` prints only the last statement's result when one string holds several statements. Pass
one `-c` per query to see them all.

## Notification checks

The [user guide](../../guides/dev-servers.md#notifications-need-redis-mailhog-and-the-worker)
covers Redis, MailHog, and the worker. To count delivered mail without a browser:

```bash
curl -s http://localhost:8025/api/v2/messages | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])"
```

`npm run notify:dummy -- alert test_user@iu.edu 2` hangs after sending, because it leaves two
`ioredis` pub/sub connections open. Both the email and the in-app row are delivered by then. This
is tracked in `.todo/issues/05-notifications.md`.
