# E2E Testing Conventions (Playwright)

## Overview

Bioloop uses **Playwright** for end-to-end (e2e) testing. Tests are **true e2e tests** that:
- Do NOT use mocked network requests
- Make calls to actual backend API
- Span across all 3 components: UI, API, Database

---

## Directory Structure

```
tests/
├── playwright.config.js          # Playwright configuration & project definitions
├── package.json                  # Test dependencies (Playwright, axios, etc.)
├── Dockerfile                    # Docker image for CI/CD test execution
├── .env.default                  # Environment variable templates
├── .gitignore                    # Excludes .auth/, test-results/, etc.
├── README.md                     # Detailed setup and usage guide
├── config/
│   ├── default.json              # Base configuration (baseURL, feature flags)
│   └── custom-environment-variables.json  # Environment variable mappings
├── api/                          # API helper functions for tests
│   ├── index.js                  # Generic REST wrappers (get, post, patch, delete)
│   ├── utils.js                  # Auth headers, URL prefixing
│   ├── project.js                # Project-specific API helpers
│   ├── dataset.js                # Dataset-specific API helpers
│   └── notification.js           # Notification-specific API helpers
├── utils.js                      # UI test utilities (selectors, form helpers)
└── tests/
    ├── setup/                    # Authentication setup projects
    │   ├── admin_login.setup.js
    │   ├── operator_login.setup.js
    │   └── user_login.setup.js
    └── view/                     # Actual test specs organized by feature
        ├── unauthenticated/
        │   └── project.spec.js
        └── authenticated/
            ├── sidebar/
            │   ├── user_role_sidebar_view.spec.js
            │   └── non_user_role_sidebar_view.spec.js
            ├── notifications/
            │   ├── user_role_notifications.spec.js
            │   └── non_user_role_notifications.spec.js
            ├── project/
            │   ├── project-dataset-table.spec.js
            │   └── project-merge-modal.spec.js
            └── userManagement/
                └── user_management.spec.js
```

---

## Configuration

### Playwright Config (`playwright.config.js`)

Key configuration:

```javascript
module.exports = {
  testDir: './tests',
  fullyParallel: true,                 // Run tests in parallel
  forbidOnly: !!process.env.CI,       // Fail CI if test.only found
  retries: process.env.CI ? 2 : 0,    // Retry failed tests in CI
  workers: process.env.CI ? 1 : undefined,  // Sequential in CI
  reporter: 'html',                    // HTML test report
  
  use: {
    baseURL: 'https://localhost',
    trace: 'on-first-retry',           // Trace on retry
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,           // For self-signed certs
    video: 'on-first-retry',           // Video capture on retry
  },
  
  projects: [
    // Setup projects (run first)
    { name: 'admin_login', testMatch: '/tests/setup/admin_login.setup.js' },
    { name: 'operator_login', testMatch: '/tests/setup/operator_login.setup.js' },
    { name: 'user_login', testMatch: '/tests/setup/user_login.setup.js' },
    
    // Test projects (depend on setup)
    {
      name: 'admin_sidebar',
      use: { storageState: ADMIN_STORAGE_STATE },
      dependencies: ['admin_login'],
      testMatch: '/view/authenticated/sidebar/*.spec.js',
    },
    // ... more projects
  ],
};
```

### Environment Configuration

**Config files:**
- `config/default.json` - Base configuration
- `config/custom-environment-variables.json` - Maps env vars to config

**Required environment variables (`.env`):**
```bash
E2E_USER=e2eUser
E2E_OPERATOR=e2eOperator
E2E_ADMIN=e2eAdmin
TEST_BASE_URL=https://localhost  # Optional override
```

**Note:** These same env vars must be set in `api/.env` with `NODE_ENV=ci` for authentication bypass.

---

## Authentication Architecture

### Authentication Bypass (CI Mode)

Tests bypass real CAS authentication using **mock tickets** when `NODE_ENV=ci`.

**How it works:**

1. **Setup project** (e.g., `admin_login.setup.js`) navigates to:
   ```javascript
   await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`);
   ```

2. **API** (in CI mode) receives mock ticket and:
   - Matches ticket value (`admin`, `operator`, `user`) to test user
   - Issues JWT token for corresponding test user
   - Returns token in response

3. **UI application code** stores token in `localStorage`

4. **Setup project** verifies login success:
   ```javascript
   await expect(page.getByTestId('header-username')).toContainText('e2eAdmin');
   ```

5. **Setup project** persists session to file:
   ```javascript
   await context.storageState({ path: ADMIN_STORAGE_STATE });
   ```

### Storage State Files

**Purpose:** Store authentication state (cookies, localStorage) for reuse across tests.

**Locations:**
- `tests/.auth/admin_storage_state.json`
- `tests/.auth/operator_storage_state.json`
- `tests/.auth/user_storage_state.json`

**Note:** `.auth/` directory is gitignored to prevent leaking secrets.

### Playwright Projects Pattern

**Setup projects:**
```javascript
{
  name: 'admin_login',
  testMatch: path.join(__dirname, '/tests/setup/admin_login.setup.js'),
}
```

**Test projects with authentication:**
```javascript
{
  name: 'admin_sidebar',
  use: { 
    ...devices['Desktop Chrome'], 
    storageState: ADMIN_STORAGE_STATE  // ← Reuse saved auth state
  },
  dependencies: ['admin_login'],       // ← Run setup first
  testMatch: '/view/authenticated/sidebar/*.spec.js',
}
```

**Benefits:**
- Each role runs in isolated browser context
- Tests for different roles can run in parallel
- Authentication setup runs once per role per test run

---

## Writing Tests

### Basic Test Structure

```javascript
const { test, expect } = require('@playwright/test');

test('test description', async ({ page }) => {
  // Navigate to page
  await page.goto('/projects');
  
  // Interact with UI
  await page.getByTestId('create-button').click();
  
  // Assert expectations
  await expect(page.getByTestId('modal')).toBeVisible();
});
```

### Test Organization Patterns

**1. Serial tests (order matters):**
```javascript
test.describe.serial('Feature name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });
  
  test('step 1', async ({ page }) => { /* ... */ });
  test('step 2', async ({ page }) => { /* ... */ });
});
```

**2. Using test steps:**
```javascript
test('Complex test', async ({ page }) => {
  await test.step('Setup data', async () => {
    // Setup code
  });
  
  await test.step('Perform action', async () => {
    // Action code
  });
  
  await test.step('Assert results', async () => {
    // Assertions
  });
});
```

**3. Conditional test execution:**
```javascript
test('Feature test', async ({ page }) => {
  test.skip(
    config.enabledFeatures.notifications.enabledForRoles.length === 0, 
    'Feature not enabled'
  );
  
  // Test code
});
```

### Selectors and Locators

**Use `data-testid` attributes (preferred):**
```javascript
// In UI component
<button data-testid="create-button">Create</button>

// In test
await page.getByTestId('create-button').click();
```

**Helper utilities (`tests/utils.js`):**
```javascript
const { testIdSelector, elementTestIdSelector } = require('../utils');

// Select by test ID with element type
const inputLocator = page.locator(elementTestIdSelector({
  elementType: 'input',
  testId: 'user-name-input',
}));
// Produces: input[data-testid=user-name-input]
```

**Locator patterns:**
```javascript
// Get by test ID
page.getByTestId('element-id')

// Get by role
page.getByRole('button', { name: 'Submit' })

// Get by text
page.getByText('Welcome')

// Locator with selector
page.locator('[data-testid=modal] button')

// First/last/nth element
page.locator('li').first()
page.locator('li').nth(2)

// Filter and chain
page.locator('tr.va-menu-item').filter({ hasText: 'Admin' })
```

### Form Interactions

**Fill and assert pattern:**
```javascript
const { fillAndAssertText } = require('../utils');

const nameInput = page.locator('input[data-testid=user-name-input]');

await fillAndAssertText({
  locator: nameInput,
  text: 'John Doe',
});
// Fills input AND asserts value was set correctly
```

**Manual fill:**
```javascript
await page.fill('input[name=username]', 'testuser');
await page.click('button[type=submit]');
```

### Assertions

**Visibility:**
```javascript
await expect(page.getByTestId('modal')).toBeVisible();
await expect(page.getByTestId('modal')).not.toBeVisible();
await expect(page.getByTestId('modal')).toBeHidden();
```

**Text content:**
```javascript
await expect(page.getByTestId('header')).toContainText('Welcome');
await expect(page.getByTestId('header')).toHaveText('Welcome User');
```

**Form values:**
```javascript
await expect(page.locator('input')).toHaveValue('expected value');
await expect(page.locator('textarea')).toBeEmpty();
```

**Count:**
```javascript
await expect(page.locator('li')).toHaveCount(5);
```

**URL:**
```javascript
await expect(page).toHaveURL('/projects');
await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+/);
```

---

## API Helpers for Tests

### Purpose

Tests often need to:
- **Set up** database state before UI interactions
- **Verify** server-side state after UI actions
- **Clean up** test data

API helpers provide convenient wrappers for making authenticated API calls from tests.

### Generic REST Wrappers (`api/index.js`)

```javascript
const { get, post, patch, deleteApi } = require('../api/index');

// GET request
const response = await get({
  requestContext: page.request,
  token: 'jwt-token',
  url: '/datasets',
  params: { project_id: '123' },
});

// POST request
const response = await post({
  requestContext: page.request,
  token: 'jwt-token',
  url: '/notifications',
  data: { label: 'Test', text: 'Message' },
});

// PATCH request
const response = await patch({
  requestContext: page.request,
  token: 'jwt-token',
  url: '/projects/123/datasets',
  data: { add_dataset_ids: [1, 2, 3] },
});

// DELETE request
const response = await deleteApi({
  requestContext: page.request,
  token: 'jwt-token',
  url: '/notifications',
  params: { status: 'CREATED' },
});
```

**How they work:**
- Accept Playwright's `page.request` (APIRequestContext)
- Add `Authorization: Bearer <token>` header automatically
- Prefix URL with `/api` automatically (via `prefixedUrl()`)
- Return Playwright's APIResponse object

### Entity-Specific Helpers

**Pattern:** Wrap generic methods into entity-specific functions.

**Example: `api/project.js`**
```javascript
const { patch, get } = require('./index');

const getProjectById = async ({ requestContext, token, id }) => 
  get({ requestContext, url: `/projects/${id}`, token });

const editProjectDatasets = async ({ requestContext, token, id, data }) =>
  patch({ requestContext, url: `/projects/${id}/datasets`, token, data });

module.exports = {
  getProjectById,
  editProjectDatasets,
};
```

**Usage in test:**
```javascript
const { editProjectDatasets } = require('../../../api/project');

test('Modify project datasets', async ({ page }) => {
  await page.goto('/projects/123');
  
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Use API helper to set up state
  await editProjectDatasets({
    requestContext: page.request,
    token,
    id: '123',
    data: { add_dataset_ids: [1, 2, 3] },
  });
  
  await page.reload();
  
  // Assert UI reflects changes
  await expect(page.getByTestId('dataset-1')).toBeVisible();
});
```

### Getting JWT Token in Tests

**All authenticated tests can access token from localStorage:**

```javascript
test('Test requiring API calls', async ({ page }) => {
  // MUST navigate to a page first (to initialize localStorage)
  await page.goto('/');
  
  // Retrieve token
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Use token with API helpers
  const response = await get({
    requestContext: page.request,
    token,
    url: '/datasets',
  });
  
  const data = await response.json();
  // ... use data
});
```

### Common API Helper Patterns

**Create entity-specific helper files:**

```javascript
// tests/api/dataset.js
const { get } = require('./index');

const getDatasets = async ({ requestContext, token, params }) =>
  get({ requestContext, url: '/datasets', token, params });

module.exports = { getDatasets };
```

```javascript
// tests/api/notification.js
const { post, deleteApi } = require('./index');

const createNotification = async ({ requestContext, token, data }) =>
  post({ requestContext, url: '/notifications', token, data });

const deleteNotifications = async ({ requestContext, token, params }) =>
  deleteApi({ requestContext, url: '/notifications', token, params });

module.exports = { createNotification, deleteNotifications };
```

**Benefits:**
- Tests read clearly with descriptive function names
- API endpoint paths centralized in one place
- Easy to update if API routes change
- Consistent authentication handling

---

## Common Testing Patterns

### Pattern 1: Setup State via API, Test UI

```javascript
const { createNotification } = require('../../../../api/notification');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Clean up existing notifications
  await deleteNotifications({
    requestContext: page.request,
    token,
    params: { status: 'CREATED' },
  });
});

test('Notification displays', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Create notification via API
  await createNotification({
    requestContext: page.request,
    token,
    data: { label: 'Test', text: 'Message' },
  });
  
  // Test that UI shows it
  await expect(page.getByTestId('notification-badge')).toContainText('1');
});
```

### Pattern 2: UI Action, Verify via API

```javascript
const { getProjectById } = require('../../../../api/project');

test('Add dataset to project', async ({ page }) => {
  await page.goto('/projects/123');
  
  // Perform UI action
  await page.getByTestId('add-dataset-button').click();
  await page.getByTestId('dataset-1-checkbox').check();
  await page.getByTestId('save-button').click();
  
  // Verify via API
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const response = await getProjectById({
    requestContext: page.request,
    token,
    id: '123',
  });
  const project = await response.json();
  
  expect(project.datasets.some(ds => ds.id === 1)).toBe(true);
});
```

### Pattern 3: Pagination Testing

```javascript
test('Pagination', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Remove all datasets from project
  await editProjectDatasets({
    requestContext: page.request,
    token,
    id: PROJECT_ID,
    data: { remove_dataset_ids: allDatasetIds },
  });
  await page.reload();
  
  // Assert pagination not visible with 0 items
  await expect(page.locator('[data-testid=pagination]')).not.toBeVisible();
  
  // Add 1 item
  await editProjectDatasets({
    requestContext: page.request,
    token,
    id: PROJECT_ID,
    data: { add_dataset_ids: [1] },
  });
  await page.reload();
  
  // Assert pagination controls visible but no page numbers
  await expect(page.locator('[data-testid=pagination]')).toBeVisible();
  await expect(page.locator('[data-testid=pagination] .va-pagination')).not.toBeVisible();
  
  // Add enough items to require pagination
  await editProjectDatasets({
    requestContext: page.request,
    token,
    id: PROJECT_ID,
    data: { add_dataset_ids: [2, 3, 4, 5, 6] },
  });
  await page.reload();
  
  // Assert page numbers visible
  await expect(page.locator('[data-testid=pagination] .va-pagination')).toBeVisible();
});
```

### Pattern 4: Modal Testing

```javascript
test.describe.serial('User management modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByTestId('edit-user-modal')).not.toBeVisible();
    
    // Open modal
    await page.getByTestId('create-user-button').click();
    await expect(page.getByTestId('edit-user-modal')).toBeVisible();
  });
  
  test('Cancel clears form', async ({ page }) => {
    // Fill fields
    await page.fill('input[data-testid=user-name-input]', 'Test Name');
    await page.fill('input[data-testid=user-email-input]', 'test@example.com');
    
    // Cancel
    await page.locator('[data-testid=edit-user-modal] [va-child=cancelButton]').click();
    
    // Reopen
    await page.getByTestId('create-user-button').click();
    
    // Assert fields cleared
    await expect(page.getByTestId('user-name-input')).toHaveText('');
    await expect(page.getByTestId('user-email-input')).toHaveText('');
  });
  
  test('Submit creates user', async ({ page }) => {
    // Fill and submit
    await page.fill('input[data-testid=user-name-input]', 'John Doe');
    await page.fill('input[data-testid=user-email-input]', 'john@example.com');
    await page.locator('[data-testid=edit-user-modal] [va-child=okButton]').click();
    
    // Assert modal closed
    await expect(page.getByTestId('edit-user-modal')).not.toBeVisible();
    
    // Verify user appears in table
    await expect(page.getByText('John Doe')).toBeVisible();
  });
});
```

### Pattern 5: Testing Different Roles

**Option A: Separate spec files**
```
tests/view/authenticated/sidebar/
├── user_role_sidebar_view.spec.js      # Tests for user role
└── non_user_role_sidebar_view.spec.js  # Tests for admin/operator
```

**Option B: Multiple projects with same spec**
```javascript
// playwright.config.js
{
  name: 'admin_sidebar',
  use: { storageState: ADMIN_STORAGE_STATE },
  dependencies: ['admin_login'],
  testMatch: '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js',
},
{
  name: 'operator_sidebar',
  use: { storageState: OPERATOR_STORAGE_STATE },
  dependencies: ['operator_login'],
  testMatch: '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js',
}
```

**Spec file:**
```javascript
// Same test runs for both admin and operator
test('sidebar items visible', async ({ page }) => {
  await page.goto('/');
  
  await expect(page.getByTestId('sidebar-projects')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-management')).toBeVisible();
});
```

---

### Pattern 6: Role-Gated Features

Some features are only enabled for specific roles (e.g., import is enabled for admin and operator but never for user). Testing this correctly requires **three synchronized configs** and a consistent project layout in `playwright.config.js`.

---

#### The Three Files That Must Stay in Sync

| File | Purpose | Field to update |
|---|---|---|
| `ui/src/config.js` | Runtime UI feature gate | `enabledFeatures.<feature>.enabledForRoles` |
| `tests/config/default.json` | Test environment mirror of the UI config | Same `enabledFeatures.<feature>.enabledForRoles` |
| `tests/playwright.config.js` | Routes each role's project to functional tests or the access-control check | `testMatch` / `testIgnore` per project |

**Hard rule: `tests/config/default.json` must always mirror `ui/src/config.js` for every `enabledForRoles` list.**

The UI config controls what the running application renders. The test config is read by `access_control.spec.js` (and any feature test that uses `test.skip`) to decide whether a test should run. If the two diverge, skip conditions fire incorrectly: tests that should run are silently skipped, or tests that should be skipped start failing.

---

#### The Three-Project Layout

For each feature, create three kinds of Playwright projects:

```javascript
// playwright.config.js

// --- Roles WITH access: run the full functional test suite ---
{
  name: 'admin_import',
  use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
  dependencies: ['admin_login'],
  testMatch: '/view/authenticated/import/*.spec.js',
  // access_control.spec.js is excluded because admin CAN access the feature.
  testIgnore: '/view/authenticated/import/access_control.spec.js',
},
{
  name: 'operator_import',
  use: { ...devices['Desktop Chrome'], storageState: OPERATOR_STORAGE_STATE },
  dependencies: ['operator_login'],
  testMatch: '/view/authenticated/import/*.spec.js',
  testIgnore: '/view/authenticated/import/access_control.spec.js',
},

// --- Roles WITHOUT access: run only the "feature disabled" check ---
{
  name: 'user_import',
  use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
  dependencies: ['user_login'],
  // Only access_control.spec.js: verifies the "feature disabled" alert is shown.
  testMatch: '/view/authenticated/import/access_control.spec.js',
},
```

---

#### The `access_control.spec.js` Pattern

Each role-gated feature should have an `access_control.spec.js` alongside its other specs:

```javascript
// tests/view/authenticated/import/access_control.spec.js
const { test, expect } = require('@playwright/test');
const config = require('config');

// Read which roles have access from tests/config/default.json.
// This MUST match ui/src/config.js enabledFeatures.import.enabledForRoles.
const importEnabledForRoles = config.enabledFeatures?.import?.enabledForRoles ?? [];

test.describe('Dataset Import access control', () => {
  test('should show a disabled-feature warning for roles without import access', async ({ page }) => {
    // Guard against misconfiguration: if no role has access the test is pointless.
    test.skip(
      importEnabledForRoles.length === 0,
      'Import feature is not configured for any role in this environment',
    );

    await page.goto('/datasets/import');

    // Roles without access see this alert instead of the feature UI.
    await expect(
      page.locator('.va-alert').filter({ hasText: 'This feature is currently disabled' }),
    ).toBeVisible({ timeout: 15000 });
  });
});
```

This spec is **only assigned** to projects whose role is NOT in `enabledForRoles` (i.e., roles that should see the disabled alert). It is **excluded** via `testIgnore` from projects whose role IS in `enabledForRoles`.

---

#### Adding a Role to a Feature's Access List

When a feature becomes available to an additional role (e.g., enabling import for operator):

1. **`ui/src/config.js`** — add the role:
   ```javascript
   import: { enabledForRoles: ["admin", "operator"] }
   ```

2. **`tests/config/default.json`** — mirror the change exactly:
   ```json
   "import": { "enabledForRoles": ["admin", "operator"] }
   ```

3. **`playwright.config.js`** — change the role's project from the access-control-only config to the full functional config:
   ```javascript
   // Before (role had no access):
   { name: 'operator_import', testMatch: '/view/authenticated/import/access_control.spec.js' }

   // After (role now has access):
   {
     name: 'operator_import',
     testMatch: '/view/authenticated/import/*.spec.js',
     testIgnore: '/view/authenticated/import/access_control.spec.js',
   }
   ```

#### Removing a Role from a Feature's Access List

Reverse the steps above: remove from both configs and switch the project back to `testMatch: 'access_control.spec.js'` (remove `testIgnore`).

---

#### Skip Conditions in Functional Tests

Functional tests that depend on config-driven behavior should guard themselves with `test.skip`:

```javascript
const config = require('config');

// Reads from tests/config/default.json — must mirror ui/src/config.js
const importEnabledForRoles = config.enabledFeatures?.import?.enabledForRoles ?? [];

test('import stepper renders', async ({ page }) => {
  // Skip entirely if the feature is off for all roles (e.g., local dev with import disabled).
  test.skip(importEnabledForRoles.length === 0, 'Import feature is disabled in this environment');

  await page.goto('/datasets/import');
  await expect(page.getByTestId('import-stepper')).toBeVisible();
});
```

---

## Running Tests

### Locally (Docker Compose)

**Requirements:**
1. Set `NODE_ENV=ci` in `api/.env`
2. Set test user credentials in `api/.env`:
   ```bash
   E2E_USER=e2eUser
   E2E_OPERATOR=e2eOperator
   E2E_ADMIN=e2eAdmin
   ```
3. Set same credentials in `tests/.env`

**Run tests:**
```bash
# Build e2e container
docker-compose -f docker-compose-e2e.yml build

# Run tests
docker-compose -f docker-compose-e2e.yml up -d

# View logs
docker logs bioloop-e2e-1 -f
```

**View results:**
- HTML report: `tests/playwright-report/index.html`
- Test artifacts: `tests/test-results/`
- Videos/traces (on failure): `tests/test-results/<test-name>/`

### Locally (VS Code Plugin)

**Setup:**
1. Install Playwright VS Code extension
2. Open workspace in VS Code
3. Ensure tests defined in `playwright.config.js`
4. Tests appear in Playwright sidebar

**Run tests:**
- Click play button next to any test
- Toggle "Show browser" for headed mode
- Dependencies (login setup) run automatically

**Record tests:**
- `Record New` - Start fresh recording
- `Record at cursor` - Continue from existing test (runs dependencies first)

### Running Specific Tests

```bash
# Run all tests
npm test

# Run specific file
npx playwright test tests/view/authenticated/sidebar/user_role_sidebar_view.spec.js

# Run specific project
npx playwright test --project=admin_sidebar

# Run in headed mode
npx playwright test --headed

# Run with UI mode (interactive)
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

---

## Best Practices

### 1. Use `data-testid` Attributes

**✅ GOOD:**
```javascript
// UI component
<button data-testid="create-project-button">Create</button>

// Test
await page.getByTestId('create-project-button').click();
```

**❌ BAD:**
```javascript
// Brittle - breaks if text changes
await page.getByText('Create').click();

// Brittle - breaks if CSS changes
await page.locator('.btn.btn-primary').click();
```

### 2. Use Setup Projects for Authentication

**✅ GOOD:**
```javascript
// playwright.config.js
{
  name: 'admin_tests',
  use: { storageState: ADMIN_STORAGE_STATE },
  dependencies: ['admin_login'],
  testMatch: '/authenticated/admin/*.spec.js',
}
```

**❌ BAD:**
```javascript
// Don't login in every test
test.beforeEach(async ({ page }) => {
  await page.goto('/auth/iucas?ticket=admin');
  // ... wait for login
});
```

### 3. Use API Helpers for State Management

**✅ GOOD:**
```javascript
// Setup via API
await createNotification({ requestContext, token, data });

// Test UI
await expect(page.getByTestId('notification')).toBeVisible();
```

**❌ BAD:**
```javascript
// Don't set up state through slow UI interactions
await page.getByTestId('create-notification').click();
await page.fill('input[name=label]', 'Test');
await page.fill('input[name=text]', 'Message');
await page.getByTestId('submit').click();
// Now test something else...
```

### 4. Clean Up Test Data

```javascript
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Clean up before each test
  await deleteNotifications({
    requestContext: page.request,
    token,
    params: { status: 'CREATED' },
  });
});
```

### 5. Use Serial Tests When Order Matters

```javascript
// Tests run sequentially (test 2 depends on test 1's state)
test.describe.serial('Multi-step workflow', () => {
  test('step 1', async ({ page }) => { /* ... */ });
  test('step 2', async ({ page }) => { /* ... */ });
});
```

### 6. Navigate Before Accessing localStorage

```javascript
// ❌ BAD - localStorage not available yet
const token = await page.evaluate(() => localStorage.getItem('token'));

// ✅ GOOD - Navigate first
await page.goto('/');
const token = await page.evaluate(() => localStorage.getItem('token'));
```

### 7. Use Meaningful Test Names

**✅ GOOD:**
```javascript
test('Pagination controls appear when more than 10 datasets', async ({ page }) => {
  // ...
});
```

**❌ BAD:**
```javascript
test('test 1', async ({ page }) => {
  // ...
});
```

### 8. Test Feature Flags

```javascript
test('Notifications display', async ({ page }) => {
  // Skip if feature disabled
  test.skip(
    config.enabledFeatures.notifications.enabledForRoles.length === 0,
    'Notifications feature not enabled'
  );
  
  // Test code...
});
```

### 9. Organize by Feature and Authentication

```
tests/view/
├── unauthenticated/       # Tests that should run logged out
│   └── project.spec.js
└── authenticated/         # Tests that require login
    ├── sidebar/
    ├── notifications/
    └── userManagement/
```

### 10. Use Isolated Test Data

```javascript
const { v4: uuidv4 } = require('uuid');

test('Create user', async ({ page }) => {
  // Use unique data to avoid conflicts
  const username = uuidv4();
  const email = `${username}@example.com`;
  
  await page.fill('input[data-testid=username]', username);
  await page.fill('input[data-testid=email]', email);
  // ...
});
```

---

## Troubleshooting

### Tests Not Showing in VS Code

1. Refresh Playwright sidebar
2. Verify `playwright.config.js` is correct
3. Ensure Playwright extension installed
4. Check package.json has correct Playwright version

### Authentication Failing

1. Verify `NODE_ENV=ci` in `api/.env`
2. Check test user credentials match in both `api/.env` and `tests/.env`
3. Ensure storage state files generated in `tests/.auth/`
4. Check API logs for CAS bypass errors

### Docker Version Mismatch

```bash
# Dockerfile and package.json must have same Playwright version
# tests/Dockerfile
FROM mcr.microsoft.com/playwright:v1.43.0-jammy

# tests/package.json
"@playwright/test": "1.43.0"
```

### HTTPS Certificate Errors

```javascript
// Already configured in playwright.config.js
use: {
  ignoreHTTPSErrors: true,  // Ignores self-signed cert errors
}
```

### Flaky Tests

1. Add explicit waits for async operations
2. Use `await expect(...).toBeVisible()` instead of `await page.waitForSelector()`
3. Increase timeout for slow operations
4. Use `test.describe.serial()` if tests depend on each other

### Debugging Tests

```bash
# Run with headed browser
npx playwright test --headed

# Debug mode (pauses before each action)
npx playwright test --debug

# UI mode (interactive debugger)
npx playwright test --ui

# Generate trace for failed test
npx playwright test --trace=on
```

**View trace:**
```bash
npx playwright show-trace tests/test-results/<test-name>/trace.zip
```

---

## Related Documentation

- **Platform README:** `tests/README.md` - Comprehensive setup guide
- **API Conventions:** `.ai/bioloop/api_conventions.md` - Understanding API endpoints
- **UI Conventions:** `.ai/bioloop/ui_conventions.md` - UI component patterns
- **Playwright Docs:** https://playwright.dev/docs/intro

---

**Last Updated:** 2026-02-06
