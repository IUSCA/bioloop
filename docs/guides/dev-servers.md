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
