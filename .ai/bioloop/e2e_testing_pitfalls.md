# E2E Testing Pitfalls

Common mistakes to avoid when writing Playwright tests for Bioloop.

---

## Authentication & State Management

### ❌ Logging in Within Each Test

**Problem:**
```javascript
test.beforeEach(async ({ page }) => {
  // Slow - logs in for every test
  await page.goto('/auth/iucas?ticket=admin');
  await expect(page.getByTestId('header-username')).toContainText('e2eAdmin');
});

test('Test 1', async ({ page }) => { /* ... */ });
test('Test 2', async ({ page }) => { /* ... */ });
test('Test 3', async ({ page }) => { /* ... */ });
```

**Why it's bad:**
- Login happens multiple times (slow)
- Test suite takes much longer to run
- More points of failure

**✅ Solution:**
Use setup projects and storage state:

```javascript
// playwright.config.js
{
  name: 'admin_login',
  testMatch: '/tests/setup/admin_login.setup.js',
},
{
  name: 'admin_tests',
  use: { storageState: ADMIN_STORAGE_STATE },
  dependencies: ['admin_login'],  // Login runs once, reused by all tests
  testMatch: '/view/authenticated/admin/*.spec.js',
}
```

---

### ❌ Accessing localStorage Before Navigation

**Problem:**
```javascript
test('Test', async ({ page }) => {
  // Error: localStorage is not defined
  const token = await page.evaluate(() => localStorage.getItem('token'));
});
```

**Why it's bad:**
- Page context not initialized yet
- localStorage doesn't exist until page loaded

**✅ Solution:**
Navigate first, then access localStorage:

```javascript
test('Test', async ({ page }) => {
  await page.goto('/');  // Initialize page context
  const token = await page.evaluate(() => localStorage.getItem('token'));
});
```

---

### ❌ Not Cleaning Up Test Data

**Problem:**
```javascript
test('Create notification', async ({ page }) => {
  await createNotification({ requestContext, token, data: { label: 'Test' } });
  // Test checks notification appears
});

test('Check notification count', async ({ page }) => {
  // This test now sees notification from previous test!
  await expect(page.getByTestId('notification-count')).toHaveText('0');  // Fails
});
```

**Why it's bad:**
- Tests affect each other
- Order-dependent failures
- Flaky test results

**✅ Solution:**
Clean up before each test:

```javascript
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Delete existing test data
  await deleteNotifications({
    requestContext: page.request,
    token,
    params: { status: 'CREATED' },
  });
});
```

---

## Selectors & Locators

### ❌ Using Brittle Selectors

**Problem:**
```javascript
// Breaks if CSS classes change
await page.locator('.btn.btn-primary.va-button--large').click();

// Breaks if text changes
await page.getByText('Create New Project').click();

// Breaks if DOM structure changes
await page.locator('div > div > button:nth-child(2)').click();
```

**Why it's bad:**
- Tests break on unrelated UI changes
- Hard to maintain
- Not semantic

**✅ Solution:**
Use `data-testid` attributes:

```javascript
// UI component
<button data-testid="create-project-button">Create New Project</button>

// Test
await page.getByTestId('create-project-button').click();
```

---

### ❌ Not Handling Multiple Elements

**Problem:**
```javascript
// Returns first match, may not be the one you want
await page.locator('button').click();
```

**Why it's bad:**
- Ambiguous which element gets clicked
- Flaky if DOM order changes
- Hard to debug

**✅ Solution:**
Be specific or use filters:

```javascript
// Option 1: Specific selector
await page.getByTestId('specific-button').click();

// Option 2: Filter by text
await page.locator('button').filter({ hasText: 'Submit' }).click();

// Option 3: Chain locators
await page.getByTestId('modal').locator('button').first().click();
```

---

## State Setup & Verification

### ❌ Setting Up State Through UI

**Problem:**
```javascript
test('Test dataset merge', async ({ page }) => {
  // Setup takes 30+ seconds through UI
  await page.goto('/datasets');
  await page.getByTestId('create-dataset').click();
  await page.fill('input[name=name]', 'Test Dataset');
  await page.fill('input[name=description]', 'Description');
  await page.getByTestId('type-select').selectOption('WGS');
  await page.getByTestId('submit').click();
  await page.waitForURL('/datasets/*');
  
  // Repeat for second dataset...
  
  // Now finally test merge functionality
  await page.getByTestId('merge-button').click();
  // ...
});
```

**Why it's bad:**
- Tests are extremely slow
- More points of failure
- Testing more than one thing

**✅ Solution:**
Set up state via API:

```javascript
test('Test dataset merge', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Setup via API (fast)
  const dataset1 = await createDataset({
    requestContext: page.request,
    token,
    data: { name: 'Dataset 1', type: 'WGS' },
  });
  
  const dataset2 = await createDataset({
    requestContext: page.request,
    token,
    data: { name: 'Dataset 2', type: 'WGS' },
  });
  
  // Now test merge UI
  await page.goto(`/datasets/${dataset1.id}`);
  await page.getByTestId('merge-button').click();
  // ...
});
```

---

### ❌ Not Verifying Server State

**Problem:**
```javascript
test('Add dataset to project', async ({ page }) => {
  await page.goto('/projects/123');
  await page.getByTestId('add-dataset').click();
  await page.getByTestId('dataset-1-checkbox').check();
  await page.getByTestId('save').click();
  
  // Only checks UI updated
  await expect(page.getByTestId('dataset-1')).toBeVisible();
  
  // What if UI shows it but API didn't save it?
});
```

**Why it's bad:**
- May pass even if API call failed
- Doesn't test full e2e flow
- False confidence

**✅ Solution:**
Verify via API as well:

```javascript
test('Add dataset to project', async ({ page }) => {
  await page.goto('/projects/123');
  await page.getByTestId('add-dataset').click();
  await page.getByTestId('dataset-1-checkbox').check();
  await page.getByTestId('save').click();
  
  // Check UI
  await expect(page.getByTestId('dataset-1')).toBeVisible();
  
  // Verify server state
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

---

## Timing & Synchronization

### ❌ Using Arbitrary Waits

**Problem:**
```javascript
await page.getByTestId('submit').click();
await page.waitForTimeout(3000);  // Hope 3s is enough
await expect(page.getByTestId('success-message')).toBeVisible();
```

**Why it's bad:**
- Makes tests slower than necessary
- Still flaky if operation takes longer
- Hard to maintain

**✅ Solution:**
Wait for specific conditions:

```javascript
await page.getByTestId('submit').click();

// Wait for specific element
await expect(page.getByTestId('success-message')).toBeVisible();

// Or wait for URL change
await page.waitForURL('/success');

// Or wait for API response
await page.waitForResponse(resp => 
  resp.url().includes('/api/projects') && resp.status() === 200
);
```

---

### ❌ Not Waiting for Async Operations

**Problem:**
```javascript
await page.getByTestId('load-data-button').click();
// Immediately check - data not loaded yet
await expect(page.getByTestId('data-table')).toContainText('Expected Data');
```

**Why it's bad:**
- Race condition - may pass or fail randomly
- Flaky tests

**✅ Solution:**
Wait for loading to complete:

```javascript
await page.getByTestId('load-data-button').click();

// Wait for loader to disappear
await expect(page.getByTestId('loading-spinner')).not.toBeVisible();

// Or wait for data to appear
await expect(page.getByTestId('data-table')).toContainText('Expected Data');
```

---

## Test Organization

### ❌ Testing Multiple Features in One Test

**Problem:**
```javascript
test('User management', async ({ page }) => {
  // Tests create, edit, delete, search, pagination, filters...
  // 200+ lines of test code
});
```

**Why it's bad:**
- Hard to debug failures
- One failure fails entire test
- Hard to maintain

**✅ Solution:**
One test per feature:

```javascript
test.describe('User management', () => {
  test('Create user', async ({ page }) => { /* ... */ });
  test('Edit user', async ({ page }) => { /* ... */ });
  test('Delete user', async ({ page }) => { /* ... */ });
  test('Search users', async ({ page }) => { /* ... */ });
  test('Pagination', async ({ page }) => { /* ... */ });
});
```

---

### ❌ Sharing State Between Tests

**Problem:**
```javascript
let userId;

test('Create user', async ({ page }) => {
  // ...
  userId = createdUser.id;  // Store for next test
});

test('Edit user', async ({ page }) => {
  await page.goto(`/users/${userId}`);  // Depends on previous test
  // ...
});
```

**Why it's bad:**
- Tests must run in specific order
- Can't run tests in parallel
- Debugging single test is hard

**✅ Solution:**
Use `test.describe.serial()` if order required, or make tests independent:

```javascript
// Option 1: Explicit serial tests
test.describe.serial('User workflow', () => {
  let userId;
  
  test('Create user', async ({ page }) => {
    userId = await createUserViaUI(page);
  });
  
  test('Edit user', async ({ page }) => {
    await page.goto(`/users/${userId}`);
    // ...
  });
});

// Option 2: Make independent (better)
test('Edit user', async ({ page }) => {
  // Create user via API for this test
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const user = await createUser({ requestContext: page.request, token });
  
  await page.goto(`/users/${user.id}`);
  // Test edit functionality
});
```

---

## Environment & Configuration

### ❌ Hardcoding Credentials

**Problem:**
```javascript
test('Login as admin', async ({ page }) => {
  await page.fill('input[name=username]', 'adminUser');  // Hardcoded
  await page.fill('input[name=password]', 'password123');  // Hardcoded
  await page.getByTestId('submit').click();
});
```

**Why it's bad:**
- Credentials exposed in code
- Hard to change per environment
- Security risk

**✅ Solution:**
Use config files:

```javascript
// config/default.json
{
  "e2e": {
    "users": {
      "admin": { "username": "e2eAdmin" }
    }
  }
}

// Test
const config = require('config');

test('Login as admin', async ({ page }) => {
  await page.goto(`/auth/iucas?ticket=admin`);
  await expect(page.getByTestId('header-username'))
    .toContainText(config.e2e.users.admin.username);
});
```

---

### ❌ Version Mismatch Between Dockerfile and package.json

**Problem:**
```dockerfile
# Dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy
```

```json
// package.json
{
  "@playwright/test": "1.43.0"
}
```

**Why it's bad:**
- Tests won't be detected in Docker
- Cryptic error messages
- Wastes CI/CD time

**✅ Solution:**
Keep versions in sync:

```dockerfile
# Dockerfile
FROM mcr.microsoft.com/playwright:v1.43.0-jammy
```

```json
// package.json
{
  "@playwright/test": "1.43.0"
}
```

---

### ❌ Not Setting CI Environment Variables

**Problem:**
Tests run locally but fail in CI because:
- `NODE_ENV=ci` not set in API
- Test user credentials not configured

**✅ Solution:**
Ensure both `api/.env` and `tests/.env` have:

```bash
# api/.env
NODE_ENV=ci
E2E_USER=e2eUser
E2E_OPERATOR=e2eOperator
E2E_ADMIN=e2eAdmin

# tests/.env
E2E_USER=e2eUser
E2E_OPERATOR=e2eOperator
E2E_ADMIN=e2eAdmin
```

---

## API Helper Patterns

### ❌ Not Using API Helpers

**Problem:**
```javascript
test('Test', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Verbose, repeated everywhere
  const response = await page.request.get('https://localhost/api/projects/123', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const project = await response.json();
});
```

**Why it's bad:**
- Repeated boilerplate
- Easy to make mistakes
- Hard to maintain if API changes

**✅ Solution:**
Use API helpers:

```javascript
const { getProjectById } = require('../../../api/project');

test('Test', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Clean, reusable
  const response = await getProjectById({
    requestContext: page.request,
    token,
    id: '123',
  });
  const project = await response.json();
});
```

---

### ❌ Not Handling API Errors

**Problem:**
```javascript
const response = await getProjectById({ requestContext, token, id: '999' });
const project = await response.json();  // What if 404?
```

**Why it's bad:**
- Test fails with cryptic error
- Hard to debug

**✅ Solution:**
Check response status:

```javascript
const response = await getProjectById({ requestContext, token, id: '999' });
expect(response.ok()).toBe(true);  // Explicitly check
const project = await response.json();

// Or check specific status
expect(response.status()).toBe(200);
```

---

## Assertions

### ❌ Missing Await on Assertions

**Problem:**
```javascript
// Missing await - assertion doesn't run!
expect(page.getByTestId('modal')).toBeVisible();
```

**Why it's bad:**
- Assertion passes even when it shouldn't
- No error thrown
- False positive

**✅ Solution:**
Always await assertions:

```javascript
await expect(page.getByTestId('modal')).toBeVisible();
```

---

### ❌ Weak Assertions

**Problem:**
```javascript
// Only checks element exists, not that it's visible
await expect(page.getByTestId('success')).toBeTruthy();

// Checks text contains substring, too loose
await expect(page.getByTestId('count')).toContainText('1');  // Matches "10", "21", etc.
```

**Why it's bad:**
- May pass when it shouldn't
- Doesn't test actual user experience

**✅ Solution:**
Use specific assertions:

```javascript
// Check visibility, not just existence
await expect(page.getByTestId('success')).toBeVisible();

// Check exact text when appropriate
await expect(page.getByTestId('count')).toHaveText('1');

// Or use regex for specific match
await expect(page.getByTestId('count')).toHaveText(/^1$/);
```

---

## Test Data

### ❌ Using Non-Unique Test Data

**Problem:**
```javascript
test('Create user', async ({ page }) => {
  await page.fill('input[name=username]', 'testuser');  // Same every time
  await page.fill('input[name=email]', 'test@example.com');  // Same every time
  // Fails on second run - user already exists
});
```

**Why it's bad:**
- Tests can't run multiple times
- Parallel execution conflicts
- Hard to clean up

**✅ Solution:**
Use unique identifiers:

```javascript
const { v4: uuidv4 } = require('uuid');

test('Create user', async ({ page }) => {
  const username = uuidv4();
  await page.fill('input[name=username]', username);
  await page.fill('input[name=email]', `${username}@example.com`);
  // Unique every time
});
```

---

### ❌ Using Production IDs in Tests

**Problem:**
```javascript
const PROJECT_ID = '98045a35-723c-4e1b-88e6-9462c1aff4c1';  // Real production ID

test('Test', async ({ page }) => {
  await page.goto(`/projects/${PROJECT_ID}`);
  // What if this project doesn't exist in test DB?
});
```

**Why it's bad:**
- Fragile - depends on specific DB state
- Won't work across environments
- May modify production data

**✅ Solution:**
Create test data or use seed data:

```javascript
test('Test', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // Create project for this test
  const response = await createProject({
    requestContext: page.request,
    token,
    data: { name: 'Test Project' },
  });
  const project = await response.json();
  
  await page.goto(`/projects/${project.id}`);
  // ...
});
```

---

## Related Documentation

- **E2E Testing Conventions:** `.ai/bioloop/e2e_testing_conventions.md`
- **Playwright Best Practices:** https://playwright.dev/docs/best-practices
- **Test README:** `tests/README.md`

---

**Last Updated:** 2026-02-06
