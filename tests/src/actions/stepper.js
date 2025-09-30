import { expect } from '@playwright/test';




/**
 * Navigates to the next step in the upload process
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<void>}
 */
export async function navigateToNextStep({ page }) {
  const nextButton = page.getByTestId('upload-next-button');
  await expect(nextButton).toBeVisible();
  await nextButton.click();
}

/**
 * Navigates to the previous step in the upload process
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<void>}
 */
export async function navigateToPreviousStep({ page }) {
  const previousButton = page.getByTestId('upload-previous-button');
  await expect(previousButton).toBeVisible();
  await previousButton.click();
}

/**
 * Verifies that a step button is enabled or disabled
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} params.stepIndex - The step index (0-based)
 * @param {boolean} params.shouldBeEnabled - Whether the button should be enabled
 * @returns {Promise<void>}
 */
export async function verifyStepButtonState({ page, stepIndex, shouldBeEnabled }) {
  const stepButton = page.getByTestId(`step-button-${stepIndex}`);
  await expect(stepButton).toBeVisible();
  
  if (shouldBeEnabled) {
    await expect(stepButton).not.toBeDisabled();
  } else {
    await expect(stepButton).toBeDisabled();
  }
}

module.exports = {
  navigateToNextStep,
  navigateToPreviousStep,
  verifyStepButtonState,
};
