const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

test.describe('Dataset Info Page', () => {
  let testDataset;

  test.beforeAll(async () => {
    // Create a test dataset in the database
    testDataset = await prisma.dataset.create({
      data: {
        id: 'test-dataset-1',
        origin_path: '/path/to/dataset',
        name: 'Test Dataset',
        type: 'RAW_DATA',
        size: 1024000, // 1 MB in bytes
        files_count: 10,
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-02T00:00:00Z'),
      }
    });
  });

  test('Dataset info is displayed correctly', async ({ page }) => {
    await page.goto(`/dataset/${testDataset.id}`);

    // Assert each field
    const fields = [
      { testId: 'dataset-origin-path', dbField: 'origin_path' },
      { testId: 'dataset-name', dbField: 'name' },
      { testId: 'dataset-type', dbField: 'type' },
      { testId: 'dataset-size', dbField: 'size', transform: (size) => `${(size / 1024 / 1024).toFixed(2)} MB` },
      { testId: 'dataset-files-count', dbField: 'files_count' },
      { testId: 'dataset-created-at', dbField: 'created_at', transform: (date) => new Date(date).toISOString() },
      { testId: 'dataset-updated-at', dbField: 'updated_at', transform: (date) => new Date(date).toISOString() },
    ];

    for (const field of fields) {
      const element = page.locator(`[data-testid="${field.testId}"] td:nth-child(2)`);
      await expect(element).toBeVisible();

      let expectedValue = testDataset[field.dbField];
      if (field.transform) {
        expectedValue = field.transform(expectedValue);
      }

      await expect(element).toHaveText(String(expectedValue));
    }
  });

  test.afterAll(async () => {
    // Clean up the test dataset
    await prisma.dataset.delete({ where: { id: testDataset.id } });
    await prisma.$disconnect();
  });
});
