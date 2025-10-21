import { expect, test } from '@playwright/test';
import { randomUUID } from 'crypto';
import {
  assertTableVisible,
  clearSearchInput,
  getColumnValues,
  initiateSearch,
} from '../../../../actions/list';
import { createDataset, generateUniqueDatasetName } from '../../../../api/dataset';

const DATASET_TYPE = 'RAW_DATA';

test.describe.serial('Dataset List', () => {
  let page; // Playwright page instance
  let token; // Auth token

  let DATASET_WITH_UNIQUE_BASE_NAME = null;
  const DATASETS_WITH_SHARED_BASE_NAME = [];

  let sharedBaseName = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset list page first to ensure localStorage is accessible
    await page.goto('/rawData');

    // Get auth token
    token = await page.evaluate(() => localStorage.getItem('token'));

    const uniqueBaseName = randomUUID();
    // Create test datasets for exact-match test case. Our test will assert
    // that exactly one Dataset is returned for this search.
    DATASET_WITH_UNIQUE_BASE_NAME = await createDataset({
      requestContext: page.request,
      token,
      data: {
        type: DATASET_TYPE,
        name: await generateUniqueDatasetName({
          requestContext: page.request,
          token,
          baseName: uniqueBaseName,
          type: DATASET_TYPE,
        }),
      },
    });
    console.log('DATASET_WITH_UNIQUE_BASE_NAME', DATASET_WITH_UNIQUE_BASE_NAME);

    sharedBaseName = randomUUID();
    // Create test datasets for partial-match test cases. Our test will assert
    // that multiple Datasets are returned for this search.
    DATASETS_WITH_SHARED_BASE_NAME.push(await createDataset({
      requestContext: page.request,
      token,
      data: {
        type: DATASET_TYPE,
        name: await generateUniqueDatasetName({
          requestContext: page.request,
          token,
          baseName: sharedBaseName,
          type: DATASET_TYPE,
        }),
      },
    }));
    DATASETS_WITH_SHARED_BASE_NAME.push(await createDataset({
      requestContext: page.request,
      token,
      data: {
        type: DATASET_TYPE,
        name: await generateUniqueDatasetName({
          requestContext: page.request,
          token,
          baseName: sharedBaseName,
          type: DATASET_TYPE,
        }),
      },
    }));
  });

  test('should show the dataset list table', async () => {
    await assertTableVisible({ page, testId: 'dataset-list' });
  });

  test.describe('Search functionality', () => {
    test('should filter datasets by exact name match', async () => {
      // Search for the exact match dataset
      await initiateSearch({
        page,
        searchTerm: DATASET_WITH_UNIQUE_BASE_NAME.name,
        testId: 'dataset-list',
      });

      // Get filtered results
      const filteredNames = await getColumnValues({
        page,
        testId: 'dataset-list',
        columnName: 'name',
      });

      console.log('filteredNames', filteredNames);

      // Should return exactly one result
      expect(filteredNames.length).toBe(1);

      // Should match the exact dataset name
      expect(filteredNames[0]).toBe(
        DATASET_WITH_UNIQUE_BASE_NAME.name,
      );

      // Clear search
      await clearSearchInput({
        page,
        testId: 'dataset-list',
      });
    });

    test('should filter datasets by partial name match', async () => {
      // Search for the partial match prefix
      await initiateSearch({
        page,
        searchTerm: sharedBaseName,
        testId: 'dataset-list',
      });

      // Get filtered results
      const filteredNames = await getColumnValues({
        page,
        testId: 'dataset-list',
        columnName: 'name',
      });

      // Should return 2 results (our test datasets)
      expect(filteredNames.length).toBe(2);

      // All results should contain the shared base name
      filteredNames.forEach((name) => {
        expect(name).toContain(sharedBaseName);
      });

      // Check that both datasets with the shared base name are present
      DATASETS_WITH_SHARED_BASE_NAME.forEach((dataset) => {
        expect(filteredNames.some((name) => name === dataset.name)).toBe(true);
      });

      // Clear search
      await clearSearchInput({
        page,
        testId: 'dataset-list',
      });
    });

    test('should show no results for non-existent dataset name', async () => {
      // Search for a non-existent dataset
      await initiateSearch({
        page,
        searchTerm: 'NonExistentDataset9999999',
        testId: 'dataset-list',
      });

      // Get filtered results
      const filteredNames = await getColumnValues({
        page,
        testId: 'dataset-list',
        columnName: 'name',
      });

      // Should return no results
      expect(filteredNames.length).toBe(0);

      // Clear search
      await clearInput({
        page,
        testId: 'dataset-list',
      });
    });
  });
});
