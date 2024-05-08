const { test, expect } = require('@playwright/test');

const config = require('config');

const DATASET_TO_DUPLICATE = 1;
let token;

test.beforeEach(async ({ page }) => {
  // console.log('beforeEach called');

  await page.goto('/');
  token = await page.evaluate(() => localStorage.getItem('token'));
});

test.describe('Duplication notification created', () => {
  test('No duplicate datasets exist', async ({ page }) => {
    await expect(notificationBadgeLocator(page)).toBeEmpty();
    const { request } = page;

    await deleteDuplicates({ request });
  });

  test('Duplicate dataset created', async ({ page }) => {
    let createdDuplicate;
    let originalDataset;
    let notificationId;
    let actionItemId;
    const REPORT_TEST_ID_PREFIX = 'dataset-duplication-report';

    await test.step('Create duplicate dataset', async () => {
      const { request } = page;

      originalDataset = await getDataset({ request, datasetId: DATASET_TO_DUPLICATE });
      createdDuplicate = await createdDuplicateDataset({
        request,
        datasetId: DATASET_TO_DUPLICATE,
      });
    });

    await test.step('Notification created', async () => {
      const actionItem = createdDuplicate.action_items[0];
      actionItemId = actionItem.id;
      notificationId = actionItem.notification.id;

      // open the notification menu
      await page.getByTestId('notification-icon').click();

      await expect(page.getByTestId(`notification-${notificationId}-label`))
        .toContainText('Duplicate Dataset Created');
      await expect(page.getByTestId(`notification-${notificationId}-text`))
        .toContainText(`Dataset ${originalDataset.name} has been duplicated. Click here to review.`);
    });

    await test.step('Navigate to action item', async () => {
      await page.getByTestId(`notification-${notificationId}-anchor`).click();

      await page.waitForURL(`/datasets/${createdDuplicate.id}/actionItems/${actionItemId}`);

      // assertions on report Info card
      const report_info_title_locator = page.getByTestId(`${REPORT_TEST_ID_PREFIX}-info`);
      await expect(report_info_title_locator)
        .toHaveClass('text-lg');
      await expect(report_info_title_locator)
        .toContainText('INFO');

      const name_td_locator = page.getByTestId(`${REPORT_TEST_ID_PREFIX}-name`)
        .locator('td');
      await expect(name_td_locator.locator('nth=0')).toContainText('Dataset Name');
      await expect(name_td_locator.locator('nth=1')).toContainText(originalDataset.name);

      const original_dataset_id_td_locator = page.getByTestId(`${REPORT_TEST_ID_PREFIX}-original-dataset-id`)
        .locator('td');
      await expect(original_dataset_id_td_locator.locator('nth=0')).toContainText('Original Dataset');
      await expect(original_dataset_id_td_locator.locator('nth=1')).toContainText(`#${originalDataset.id}`);

      const duplicate_dataset_id_td_locator = page.getByTestId(`${REPORT_TEST_ID_PREFIX}-duplicate-dataset-id`)
        .locator('td');
      await expect(duplicate_dataset_id_td_locator.locator('nth=0')).toContainText('Duplicate Dataset');
      await expect(duplicate_dataset_id_td_locator.locator('nth=1')).toContainText(`#${createdDuplicate.id}`);

      // assertions on report details
      // assertions on report Info card
      const report_body_title_locator = page.getByTestId(`${REPORT_TEST_ID_PREFIX}-body`);
      await expect(report_body_title_locator)
        .toHaveClass('text-lg');
      await expect(report_body_title_locator)
        .toContainText('DUPLICATION ANALYSIS REPORT');
    });
  });
});

const notificationBadgeLocator = (page) => page.getByTestId('notification-count')
  .locator('span.va-badge__text');

// const notificationMenuItemLocator = (page) =>
// page.getByTestId('notification-menu-items') .locator('tr.va-menu-item');

const createdDuplicateDataset = async ({ request, datasetId }) => {
  const createResponse = await request.post(`${config.apiBasePath}/datasets/${datasetId}/duplicate`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  const createdDataset = await createResponse.json();
  return createdDataset;
};

const getDataset = async ({ request, datasetId }) => {
  const response = await request.get(`${config.apiBasePath}/datasets/${datasetId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  const dataset = await response.json();
  return dataset;
};

const deleteDuplicates = async ({ request }) => {
  const response = await request.delete(`${config.apiBasePath}/datasets`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
    params: {
      is_duplicate: true,
    },
  });
  await response.json();
};
