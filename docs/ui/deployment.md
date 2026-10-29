# Production UI container

The production UI is built once with Node 24 and served by nginx. The container
replaces the previous `ui` service that installed dependencies and ran
`builddev` against a bind-mounted checkout. Node and the source tree are not
required in the runtime image.

## Migrating an existing portal

1. Build the new image from the repository root:

   ```bash
   docker compose -f docker-compose-prod.yml build ui
   ```

   Alternatively, set `UI_IMAGE` to your published image. Its default is
   `bioloop-ui:local`. Use `docker compose ... up -d --no-build ui` when deploying
   an already built image.

2. Set `UI_TLS_CERT_DIR` in the root Compose `.env` file to a host directory
   containing `cert.pem` (the certificate chain) and `key.pem` (the private key):

   ```dotenv
   UI_TLS_CERT_DIR=/srv/bioloop/tls
   UI_HTTP_PORT=80
   UI_HTTPS_PORT=443
   UPLOAD_ENABLED_ROLES=admin
   ```

   Compose mounts that directory read-only at `/etc/nginx/certs`. nginx reads
   `/etc/nginx/certs/cert.pem` and `/etc/nginx/certs/key.pem`; both files must
   exist and be readable by the container. The default directory is `./ui/.cert`,
   intended for local checks. Production deployments should provide their own
   trusted TLS certificate. Never commit a private key.

3. Ensure the configured host ports are available. The `ui` container now
   serves HTTP and HTTPS itself; stop or reconfigure any previous frontend
   nginx container that occupied those same ports.

4. Start the updated service:

   ```bash
   docker compose -f docker-compose-prod.yml up -d ui
   ```

   The UI waits for the API health check. `/api/` is proxied to the Compose
   `api` service; both services must share the configured network. Grafana is
   optional and is resolved only when needed.

## Runtime configuration

`UPLOAD_ENABLED_ROLES` is a comma-separated list of `admin`, `operator`, and
`user`. It defaults to `admin`. The container generates `/runtime-config.js`
on startup, so changing the role list requires recreating the UI container,
not rebuilding the image. HTML and runtime configuration are revalidated
instead of being served from a stale browser cache.

This variable controls UI visibility only. The API must independently enforce
the same access policy on Upload endpoints. Hiding a page or a button does not
prevent a caller from sending an API request; do not rely on this setting as
authorization.

`VITE_UPLOAD_ENABLED_ROLES` is the build-time fallback for local UI development.
It does not replace the API's permission checks. This change does not alter
Import permissions.

## Validation

Run UI lint, Vitest, and the production build from `ui/`. Build the image with
the command above, then check the deployed HTML, `/runtime-config.js`, Upload
visibility, and `/api/health` over HTTPS. Use a fresh browser session when
checking changed runtime roles.

The default E2E harness deliberately uses a separate test-only UI image so CI
can validate the current app independently of this deployment migration.
