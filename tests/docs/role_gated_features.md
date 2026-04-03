## Role-Gated Features

For the broader plan (multi-role specs, config sync automation, and backlog), see **`.ai/features/e2e_suite.md`** §4 (including **Upload e2e layout & project ownership**). Upload specs: **`tests/src/tests/view/authenticated/upload/`**; Playwright `testMatch` uses prefix **`/view/authenticated/upload/`** (see `playwright.config.js`).

Some features are only available to a subset of roles (e.g. a feature enabled for admin and operator but not for user). Testing this correctly requires keeping runtime UI feature flags and Playwright role routing in sync.

### Sync Requirement

| What | Why |
|---|---|
| Runtime UI feature config (`enabledForRoles` list) | Source of truth — controls whether the feature renders or the "feature disabled" alert shows. |
| Playwright project definitions (`testMatch` / `testIgnore` per project) | Routes each role to either the full functional test suite or the access-control check, based on whether that role has access. |
| `tests/src/utils/feature.js` + `playwright.config.js` | `buildFeatureEnabledRolesFromEnv()` mirrors UI resolution using the **same** `VITE_*` env vars docker e2e passes into the UI container (and into the e2e runner when set). Not HTTP “read from UI” — see `.ai/features/e2e_suite.md` for why. |
| `E2E_TARGET_ROLES` | Test-only: which roles get login + role-scoped projects (not a UI concern). |

Both must be updated together whenever a role is added to or removed from a feature's access list.

### Role metadata in specs

Projects created with `makeRoleProject` set `metadata: { e2eRole: 'admin' | 'operator' | 'user' }`. Specs that need the current role should read `test.info().project.metadata?.e2eRole` (see `project_dataset_access.spec.js`) instead of parsing the project name string.

### Project Layout

For each role-gated feature, create one project per role:

```javascript
// playwright.config.js

// Roles WITH access — run the full functional test suite.
// access_control.spec.js is excluded because these roles reach the real UI.
{
  name: 'admin_import',
  use: { storageState: ADMIN_STORAGE_STATE },
  dependencies: ['admin_login'],
  testMatch: '/view/authenticated/import/*.spec.js',
  testIgnore: '/view/authenticated/import/access_control.spec.js',
},

// Roles WITHOUT access — only verify the "feature disabled" alert is shown.
{
  name: 'user_import',
  use: { storageState: USER_STORAGE_STATE },
  dependencies: ['user_login'],
  testMatch: '/view/authenticated/import/access_control.spec.js',
},
```

The two cases are mutually exclusive: a project must never run both the functional tests and the access-control spec at the same time.

### CI Role Matrix Execution

`tests/playwright.config.js` now supports role-scoped runs without changing spec files:

- `E2E_TARGET_ROLES=admin,operator,user` (default: all three)
- `E2E_SKIP_UNAUTHENTICATED=1` to run authenticated projects only

For role-gated features, set UI/runtime role flags via a single JSON env var:

- `VITE_ALLOW_FEATURE_ROLE_OVERRIDES=1` (required to activate overrides)
- `VITE_FEATURE_ROLE_OVERRIDES`
- Example:
  `{"import":["admin","operator"],"uploads":["admin","operator","user"],"notifications":[]}`

Examples:

```bash
# Run authenticated suite as admin only
E2E_SKIP_UNAUTHENTICATED=1 E2E_TARGET_ROLES=admin npx playwright test

# Run authenticated suite as operator only
E2E_SKIP_UNAUTHENTICATED=1 E2E_TARGET_ROLES=operator npx playwright test

# Run authenticated suite as user only
E2E_SKIP_UNAUTHENTICATED=1 E2E_TARGET_ROLES=user npx playwright test

# Run role-matrix with custom feature-role policy (single UI/e2e config source)
VITE_ALLOW_FEATURE_ROLE_OVERRIDES=1 \
VITE_FEATURE_ROLE_OVERRIDES='{"import":["admin","operator"],"uploads":["admin","operator","user"],"notifications":[]}' \
E2E_SKIP_UNAUTHENTICATED=1 \
npx playwright test
```

This is intended for CI matrix jobs (one job per role), so the same spec file set can be exercised under different sessions.

### Production UI (`docker-compose-prod.yml`)

The production compose file’s `ui` service does **not** set `VITE_ALLOW_FEATURE_ROLE_OVERRIDES` or `VITE_FEATURE_ROLE_OVERRIDES`. The UI runs `npm run builddev`, which is **`vite build --watch`**: output is rebuilt when sources change (watch mode), not a browser HMR dev server. Vite still **inlines** `import.meta.env.VITE_*` at **each build**; there is no runtime override from the client.

**How JSON overrides stay off in production**

1. **Code default:** In `ui/src/services/features.js`, JSON overrides are applied only when `VITE_ALLOW_FEATURE_ROLE_OVERRIDES === "1"`. Otherwise override parsing yields `{}`.
2. **Compose:** Do not add `VITE_ALLOW_FEATURE_ROLE_OVERRIDES=1` (or JSON) to the `ui` service unless you intentionally want that bundle to honor `VITE_FEATURE_ROLE_OVERRIDES`.
3. **Host env / `.env.production`:** If the build process exports `VITE_ALLOW_FEATURE_ROLE_OVERRIDES=1`, it would be baked into the client bundle. Keep that flag unset (or not `1`) on production build hosts and avoid committing production `.env` files that enable it.

Per-feature tuning without JSON remains available via the existing `VITE_*_ENABLED_FOR_ROLES` variables at build time; they apply whenever the JSON override path does not supply a list for that feature.

### The `access_control.spec.js` Pattern

Each role-gated feature directory should contain an `access_control.spec.js`. This spec:

- Is assigned only to projects whose role does **not** have access to the feature.
- Navigates to the feature's page and asserts the "feature disabled" alert is visible.
- Reads `enabledForRoles` from the test environment config and skips if it is empty (which would indicate a misconfiguration rather than a genuine access restriction).

```javascript
import { test, expect } from '@playwright/test';
import config from 'config';

const enabledForRoles = config.enabledFeatures?.myFeature?.enabledForRoles ?? [];

test.describe('My feature access control', () => {
  test('should show a disabled-feature warning for roles without access', async ({ page }) => {
    test.skip(
      enabledForRoles.length === 0,
      'Feature has no enabled roles in the test config — check the sync requirement.',
    );

    await page.goto('/my-feature');

    await expect(
      page.locator('.va-alert').filter({ hasText: 'This feature is currently disabled' }),
    ).toBeVisible({ timeout: 15000 });
  });
});
```

### Changing a Role's Access

**To give a role access to a feature:**
1. Add the role to runtime UI feature config (prefer env override values used by CI/e2e).
2. In `playwright.config.js`, change the role's project `testMatch` to the full functional glob and add `testIgnore` for `access_control.spec.js`.

**To remove a role's access**, reverse the steps above: remove from runtime UI config and switch the project back to only matching `access_control.spec.js` (remove `testIgnore`).

