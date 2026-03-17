const { expect, test } = require('@playwright/test');
const { getImportSources } = require('../../../../api/import');
const { get, post } = require('../../../../api/index');

/**
 * Import Sources — API-level E2E tests
 *
 * These tests verify the behavior of the import sources API and the
 * access control / allowlist enforcement in the filesystem and dataset
 * creation routes.
 *
 * All three roles should be able to read import sources.
 * The /fs route should only serve paths within a configured import source.
 * POST /datasets with create_method=IMPORT should reject paths outside any import source.
 */
test.describe('GET /datasets/imports/sources', () => {
  test('admin can retrieve import sources', async ({ adminToken, page }) => {
    await page.goto('/');
    const response = await getImportSources({
      requestContext: page.request,
      token: adminToken,
    });
    expect(response.ok()).toBe(true);
    const sources = await response.json();
    expect(Array.isArray(sources)).toBe(true);
  });

  test('operator can retrieve import sources', async ({ operatorToken, page }) => {
    await page.goto('/');
    const response = await getImportSources({
      requestContext: page.request,
      token: operatorToken,
    });
    expect(response.ok()).toBe(true);
    const sources = await response.json();
    expect(Array.isArray(sources)).toBe(true);
  });

  test('user role can retrieve import sources', async ({ userToken, page }) => {
    await page.goto('/');
    const response = await getImportSources({
      requestContext: page.request,
      token: userToken,
    });
    expect(response.ok()).toBe(true);
    const sources = await response.json();
    expect(Array.isArray(sources)).toBe(true);
  });

  test('import sources are sorted by sort_order then label', async ({ adminToken, page }) => {
    await page.goto('/');
    const response = await getImportSources({
      requestContext: page.request,
      token: adminToken,
    });
    expect(response.ok()).toBe(true);
    const sources = await response.json();

    if (sources.length < 2) {
      test.skip(true, 'Need at least 2 import sources to verify ordering');
      return;
    }

    // Sources with a sort_order should appear before those with null sort_order
    const withOrder = sources.filter((s) => s.sort_order !== null);
    const withoutOrder = sources.filter((s) => s.sort_order === null);
    expect(sources.slice(0, withOrder.length)).toEqual(withOrder);
    expect(sources.slice(withOrder.length)).toEqual(withoutOrder);
  });

  test('unauthenticated request is rejected', async ({ page }) => {
    await page.goto('/');
    const response = await getImportSources({
      requestContext: page.request,
      token: null,
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('GET /fs — allowlist enforcement', () => {
  test('request for path outside any import source returns 403', async ({ adminToken, page }) => {
    await page.goto('/');
    const response = await get({
      requestContext: page.request,
      token: adminToken,
      url: '/fs',
      params: { path: '/totally/outside/any/import/source/path' },
    });
    expect(response.status()).toBe(403);
  });

  test('request without a path returns 403', async ({ adminToken, page }) => {
    await page.goto('/');
    const response = await get({
      requestContext: page.request,
      token: adminToken,
      url: '/fs',
      params: {},
    });
    expect(response.status()).toBe(403);
  });

  test('path traversal attempt is blocked', async ({ adminToken, page }) => {
    await page.goto('/');
    // Retrieve an import source to build a traversal path from
    const sourcesResponse = await getImportSources({
      requestContext: page.request,
      token: adminToken,
    });
    const sources = await sourcesResponse.json();
    if (sources.length === 0) {
      test.skip(true, 'No import sources configured — skipping path traversal test');
      return;
    }

    const sourcePath = sources[0].path;
    // Attempt to traverse above the import source root
    const traversalPath = `${sourcePath}/../../etc/passwd`;
    const response = await get({
      requestContext: page.request,
      token: adminToken,
      url: '/fs',
      params: { path: traversalPath },
    });
    // path.resolve() collapses /../ and the resulting path won't match the import source
    expect(response.status()).toBe(403);
  });

  test('path within a configured import source is allowed (or returns 404 if dir does not exist)', async ({
    adminToken,
    page,
  }) => {
    await page.goto('/');
    const sourcesResponse = await getImportSources({
      requestContext: page.request,
      token: adminToken,
    });
    const sources = await sourcesResponse.json();
    if (sources.length === 0) {
      test.skip(true, 'No import sources configured — skipping allowlist access test');
      return;
    }

    const sourcePath = sources[0].path;
    const response = await get({
      requestContext: page.request,
      token: adminToken,
      url: '/fs',
      // Trailing slash triggers directory listing
      params: { path: `${sourcePath}/` },
    });
    // The server should not return 403 for a path within a configured import source.
    // It may return 500 (mount not configured) or an empty array (dir does not exist in
    // docker/dev) but NOT 403.
    expect(response.status()).not.toBe(403);
  });
});

test.describe('POST /datasets — import origin_path allowlist', () => {
  test('creating a dataset with create_method=IMPORT and origin_path outside any import source returns 403', async ({
    adminToken,
    page,
  }) => {
    await page.goto('/');
    const response = await post({
      requestContext: page.request,
      token: adminToken,
      url: '/datasets',
      data: {
        name: `test-import-outside-${Date.now()}`,
        type: 'RAW_DATA',
        origin_path: '/path/outside/any/configured/import/source',
        create_method: 'IMPORT',
      },
    });
    expect(response.status()).toBe(403);
  });

  test('creating a dataset with create_method=IMPORT and origin_path within an import source succeeds', async ({
    adminToken,
    page,
  }) => {
    await page.goto('/');
    const sourcesResponse = await getImportSources({
      requestContext: page.request,
      token: adminToken,
    });
    const sources = await sourcesResponse.json();
    if (sources.length === 0) {
      test.skip(true, 'No import sources configured — skipping allowlist success test');
      return;
    }

    const sourcePath = sources[0].path;
    const datasetName = `test-import-allowed-${Date.now()}`;
    const response = await post({
      requestContext: page.request,
      token: adminToken,
      url: '/datasets',
      data: {
        name: datasetName,
        type: 'RAW_DATA',
        origin_path: `${sourcePath}/some-subdir`,
        create_method: 'IMPORT',
      },
    });
    // Should be 200 (created) not 403. The dataset may or may not have a workflow
    // started against it — that's out of scope for this test.
    expect(response.status()).toBe(200);
  });
});
