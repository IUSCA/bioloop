const { test, expect } = require('@playwright/test');

const config = require('config');
const { getDataset, createdDuplicateDataset } = require('./api');

const DATASET_TO_DUPLICATE = 2;
let token;

test.beforeEach(async ({ page }) => {
  // console.log('beforeEach called');

  await page.goto('/');
  token = await page.evaluate(() => localStorage.getItem('token'));
});

test.describe('Dataset duplication', () => {
  test('Duplicate dataset created', async ({ page }) => {
    let createdDuplicate;
    let originalDataset;
    let notificationId;
    let actionItemId;
    const REPORT_TEST_ID_PREFIX = 'dataset-duplication-report';

    await test.step('Create duplicate dataset', async () => {
      const { request } = page;

      originalDataset = await getDataset({ request, token, datasetId: DATASET_TO_DUPLICATE });
      createdDuplicate = await createdDuplicateDataset({
        request,
        token,
        datasetId: DATASET_TO_DUPLICATE,
      });
    });

    await test.step('Duplication Analysis Report', async () => {
      const { request } = page;
    });
  });
});
