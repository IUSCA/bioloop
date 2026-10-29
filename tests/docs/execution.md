## Running UI tests

### Unit tests

From `ui/`, install the locked dependencies and run the complete Vitest suite:

```bash
npm ci --legacy-peer-deps
npm test
```

To run one file, use `npm test -- src/stores/auth.spec.js`.
`npm run test:watch` reruns unit tests while you edit.

### End-to-end tests

Install the Playwright dependencies once from `tests/`:

```bash
npm ci
npx playwright install --with-deps chromium
```

From the repository root, run the complete configured suite:

```bash
npm run test:e2e
```

The runner builds the checked-out UI in the test-only `tests/Dockerfile.ui`,
starts the isolated `bioloop-e2e` Compose project on
`https://localhost:13443`, seeds fresh temporary database volumes, and runs
Playwright. It removes that project's containers, volumes, and temporary TLS
certificate on success or failure. It does not use the production UI image
or start a new Vite development server.

The test profile matches the UI on `main`: Import and Upload are admin-only.
Operator and User Import projects check the disabled-feature warning.
User-only Upload association cases require an enabled User Upload UI and
are not selected by this admin-only profile. Notifications remain excluded
while their access policy is WIP; no notification implementation is changed.

### Run a project or one file

From the repository root:

```bash
npm run test:e2e -- --project=admin_import
npm run test:e2e -- --project=upload
npm run test:e2e -- src/tests/view/authenticated/upload/file_selection_step.spec.js --project=upload
```

Arguments are passed directly to Playwright; authentication setup dependencies
run automatically. Do not put `NODE_ENV=ci` in your local `api/.env`.
Compose selects CI authentication for the isolated API.

Open the latest report from `tests/` with `npx playwright show-report`.

### GitHub Actions

UI CI runs lint, the complete Vitest suite, and the Vite production build.
After those pass, it runs the complete configured Playwright suite and uploads
the HTML report and failure artifacts. No smoke-only filter is used.
