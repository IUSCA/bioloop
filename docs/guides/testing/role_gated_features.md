## Role-Gated Features

Some features are only available to a subset of roles (e.g. a feature enabled for admin and operator but not for user). Testing this correctly requires keeping three things in sync, and following a consistent project layout.

### The Three-Way Sync Requirement

| What | Why |
|---|---|
| Runtime UI feature config (`enabledForRoles` list) | Source of truth — controls whether the feature renders or the "feature disabled" alert shows. |
| Test environment feature config (the `config` package read by spec files) | Must mirror the UI config exactly. Spec files read this to decide whether to run or skip a test. If the two diverge, tests silently skip when they should run, or fail when they should be skipped. |
| Playwright project definitions (`testMatch` / `testIgnore` per project) | Routes each role to either the full functional test suite or the access-control check, based on whether that role has access. |

All three must be updated together whenever a role is added to or removed from a feature's access list.

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
1. Add the role to the runtime UI feature config (`enabledForRoles`).
2. Add the same role to the test environment feature config (keep them in sync).
3. In `playwright.config.js`, change the role's project `testMatch` to the full functional glob and add `testIgnore` for `access_control.spec.js`.

**To remove a role's access**, reverse the steps above: remove from both configs and switch the project back to only matching `access_control.spec.js` (remove `testIgnore`).

