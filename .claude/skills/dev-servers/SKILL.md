---
name: dev-servers
description: How to start, stop, restart, and read the logs of the local API and UI dev servers with bin/devserver.sh, so that a human terminal and an agent session control the same processes. Use whenever the running app is needed - verifying a change in the browser, driving Chrome DevTools MCP, reading server logs, or recovering a wedged server.
---

# Running the local dev servers

`bin/devserver.sh` starts the API, the UI, and the notification email worker detached from
whoever launched them. A human terminal and an agent session then control the same processes.

- [docs/guides/dev-servers.md](../../../docs/guides/dev-servers.md) is the user guide:
  notifications, `/dev-login`, the demo world, restarts.
- [docs/contributing/techniques/dev-servers.md](../../../docs/contributing/techniques/dev-servers.md)
  is the agent reference: the seeded cast and ids, account queries, psql, process details.
- The Python celery workers are not managed here; see the `workers-dev` skill.

## Commands

```
bin/devserver.sh up | down | restart | status | logs   [api|ui|notifications-worker ...]
```

- Names default to all three. The worker's name is `notifications-worker`, not `worker`.
- Logs go to `logs/<name>.log`, pids to `logs/<name>.pid`. `logs` follows them; Ctrl-C is safe.
- API: `http://localhost:3030`. UI: `https://localhost` (443, self-signed). The worker has no port.

**Never start a server with a bare `npm run dev` or `nohup … &` from a tool call.** The harness
kills the process group when the call ends. The script uses `python3` with
`start_new_session=True`, because macOS has no `setsid`.

**Restart only when reload cannot cover it.** Nodemon and Vite reload on file changes. Restart for
a changed `.env` or config, a new dependency, or a wedged process.

## Is it really up?

```bash
bin/devserver.sh status
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/          # expect 200
curl -s  -o /dev/null -w "%{http_code}\n" http://localhost:3030/      # expect 401
```

- **`401` from the API is healthy.** It is alive and demanding authentication.
- **`ECONNREFUSED` in `ui.log` during the first ~12 seconds is normal.** The API is still booting.
- **`status` reports nodemon, not the app.** An `api` row with no port is a crashed app, even when
  it says `running`. `logs/api.log` ends with `[nodemon] app crashed`.
  `bin/devserver.sh restart api` clears it.
- **Restart the API after every `prisma migrate reset`.** The reset briefly empties the access
  types, the API exits with `Grant access types missing from database`, and nodemon does not retry.
- **A long automated run must warm both servers and retry the API heartbeat.** Any save under
  `api/`, even by another session, restarts nodemon and refuses connections for a second or two.

## Signing in without CAS

```
https://localhost/dev-login                                   # test_user, platform admin
https://localhost/dev-login?username=alice&next=/v2/groups    # any active user
```

- **A fresh DevTools browser stops on `net::ERR_CERT_AUTHORITY_INVALID`.** Call `type_text` with
  `thisisunsafe` on the warning page; it needs no focus.
- **Chrome DevTools MCP cannot attach while another Chrome holds its profile** ("The browser is
  already running for …chrome-profile"). Ask the user to quit that window.
- **After a database reset, visit `/dev-login` again.** The old session's `subject_id` no longer
  exists. Reads still work, and writes fail with a foreign-key error such as
  `group_user.removed_by`. It is not a bug in your change.
- **Never weaken the `isDevelopment()` guard** in `api/src/utils/environment.js`. It is the only
  protection on `POST /auth/test_login`, which takes a username with no credential.

## Which account to use

- **Never check an access-control change as `test_user` or `priya`.** A platform admin is allowed
  before any policy runs, so no policy path executes.
- **Use the seeded flows cast** rather than hunting: `alice` (Wong Lab admin), `bob` (Wong Lab
  member), `frank` (outsider), `quinn` (no group, no grant). The full table and fixed group ids
  are in the techniques page.
- **`/v2/datasets/:id` takes `dataset.resource_id`, which changes on every reset.** The integer id
  renders "Failed to load dataset". Look it up with SQL.
- **`quinn` still sees some sample-world datasets** through grants to `Public` and
  `Authenticated Users`. Assert emptiness against the flows-world names only.
- **Do not memorise sample-world usernames** such as `user-0NN`. Memberships are hashed and move;
  query for one.
- **`npm run seed:demo` shares usernames with `npm run seed`.** Never seed one on top of the other.
  The demo world has no `test_user` and no platform admin.

## Notifications

- In-app notifications need Redis and the API. Email also needs `notifications-worker` and MailHog:
  `docker compose up -d redis mailhog` (SMTP 1025, UI 8025).
- `[Worker] Ready — waiting for jobs` ends a good worker boot.
- Repeated "default user does not require a password" Redis warnings are normal.
- **Do not run `npm run dev:all` in `api/` alongside `devserver.sh`.** Two workers compete for the
  same queues.
- `npm run notify:dummy -- alert test_user@iu.edu 2` hangs after sending. Ctrl-C is safe.

## Database

```sh
cd api && set -a && . ./.env && set +a
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" -d "$DATABASE_DB"
```

- `docker compose exec postgres psql -U postgres` fails; that role does not exist.
- `psql -c` with several statements prints only the last result. Use one `-c` per query.
- **To use a scratch database, override `DATABASE_URL`, not `DATABASE_DB`.** Sourcing `.env`
  already expanded the URL, so Prisma keeps talking to the dev database.

## Keeping this current

When a session hits something this page does not mention - a new failure mode, a port that
moved, a startup message worth recognising - amend this file in the same change. Put the
immediate trap here, and the detail in
[docs/contributing/techniques/dev-servers.md](../../../docs/contributing/techniques/dev-servers.md)
or, when a human needs it too, [docs/guides/dev-servers.md](../../../docs/guides/dev-servers.md).
Verify a claim against the running system before writing it down here.
