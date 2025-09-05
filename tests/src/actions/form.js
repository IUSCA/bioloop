import { expect } from '@playwright/test';

/**
 * Verifies that form validation errors are displayed
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.errorMessage - The expected error message
 * @param {string} [params.errorSelector] - Custom selector for the error element
 * @returns {Promise<void>}
 */
export async function verifyFormError({ page, errorMessage, errorSelector = '.va-text-danger' }) {
  const errorElement = page.locator(errorSelector);
  await expect(errorElement).toBeVisible();
  await expect(errorElement).toHaveText(errorMessage);
}

module.exports = {
  verifyFormError,
};
