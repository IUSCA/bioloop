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
    let actionItem;
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
      actionItem = createdDuplicate.action_items[0];
      actionItemId = actionItem.id;
      notificationId = actionItem.notification.id;
    });

    await test.step('Navigate to action item', async () => {
      await page.getByTestId('notification-icon').click();
      await page.getByTestId(`notification-${notificationId}-anchor`).click();

      await page.waitForURL(`/datasets/${createdDuplicate.id}/actionItems/${actionItemId}`);
    });

    await test.step('Duplication Analysis Report', async () => {
      const { request } = page;
    });
  });
});
