# Docker E2E Change Log and Port/User Wiring

This document lists the concrete changes needed to make the app + e2e tests run reliably in Docker for this repo.

## 1) Port collision hardening

### Host ports moved to a non-default range in `docker-compose-e2e.yml`

- `ui`: `127.0.0.1:24443:443`
- `postgres`: `127.0.0.1:25433:5432`
- `queue` (RabbitMQ mgmt): `127.0.0.1:25673:15672`
- `mongo`: `127.0.0.1:27037:27017`
- `docs`: `127.0.0.1:25173:5173`
- `grafana` (metrics profile): `23000:3000`
- `jupyter_ijs` (repl profile): `28888:8888`

## 2) Every place to update when a host port changes

If any mapped host port in `docker-compose-e2e.yml` changes, update all relevant references below.

### UI host port (`24443`) consumers

1. `docker-compose-e2e.yml`
   - `ui.ports` host mapping (left side of `host:container`).
2. `tests/.env.default`
   - `TEST_BASE_URL=https://localhost:<ui-host-port>`
   - `TEST_API_BASE_URL=https://localhost:<ui-host-port>/api`
3. Any direct test URLs
   - Prefer using config values, but if hardcoded local URLs exist, update them too.

### Why `TEST_API_BASE_URL` points to UI host port

- The e2e service runs with `network_mode: "host"`.
- Tests call API through the UI ingress (`https://localhost:<ui-host-port>/api`), not by container DNS name.

## 3) Port safety scripts added for e2e

### `bin/deploy_containerized_e2e.sh`

- Validates:
  - host listener conflicts (`lsof` check),
  - compose-file collisions across `/Users/ripandey/dev` (`docker-compose*.yml` scan).
- Uses `docker compose -f docker-compose-e2e.yml -p <name> up -d`.

### `bin/reset_docker_e2e.sh`

- Runs `docker compose ... down --remove-orphans --volumes`.
- Removes `api/.db_seeded` so API seed runs again on next startup.

## 4) E2E config wiring fixes

### Environment-variable mapping

- `tests/config/custom-environment-variables.json` maps:
  - `baseURL` -> `TEST_BASE_URL`
  - `apiBaseURL` -> `TEST_API_BASE_URL`
  - e2e usernames -> `E2E_ADMIN`, `E2E_OPERATOR`, `E2E_USER`

### Default test env values

- `tests/.env.default`:
  - `E2E_ADMIN=e2eAdmin`
  - `E2E_OPERATOR=e2eOperator`
  - `E2E_USER=e2eUser`
  - `TEST_BASE_URL=https://localhost:24443`
  - `TEST_API_BASE_URL=https://localhost:24443/api`

## 5) Test users and role-ticket behavior

### Seed/user source files

- `api/admins.json`
- `api/operators.json`
- `api/users.json`

These must contain the intended e2e accounts (`e2eAdmin`, `e2eOperator`, `e2eUser`) with valid names/emails.

### CI role-ticket auth mode requirement

- `docker-compose-e2e.yml` sets `api.environment: NODE_ENV=ci`.
- This is required so `POST /auth/cas/verify` accepts test tickets (`admin`, `operator`, `user`) without external CAS.

### Deterministic role mapping fix

- `api/src/services/auth.js` (`find_or_create_test_user`) was updated so role tickets always map to the expected effective role.
- This prevents a stale seeded user (for example, `e2eUser`) from accidentally authenticating with admin role during e2e.

## 6) Role-gated feature sync (important for test validity)

Keep these in sync whenever feature access changes:

1. Runtime UI feature config (`ui/src/config.js`, `enabledFeatures.<feature>.enabledForRoles`)
2. Test config (`tests/config/default.json`, matching `enabledFeatures.<feature>.enabledForRoles`)
3. Playwright project routing (`tests/playwright.config.js`, `testMatch`/`testIgnore`)

For uploads, test config was synced with:

- `enabledFeatures.uploads.enabledForRoles = ["admin", "operator", "user"]`

## 7) Playwright project isolation for role assertions

- `tests/playwright.config.js` includes a dedicated project:
  - `upload_role_visibility`
- `uploads_index_admin_visibility.spec.js` is excluded from the generic `upload` project to avoid inherited admin storage state contaminating role checks.

## 8) Auth helper stability fix

- `tests/src/fixtures/auth.js` `getTokenByRole()` now:
  - uses absolute URL (`${config.apiBaseURL}/auth/cas/verify`),
  - enables `ignoreHTTPSErrors: true` for local TLS.

This avoids request-context baseURL edge cases during Docker e2e runs.

