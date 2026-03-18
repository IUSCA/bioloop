const { expect } = require('../fixtures');

/**
 * Navigates to the next step in a stepper
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} [params.nextButtonTestId='upload-next-button'] - The test ID of the next button
 * @returns {Promise<void>}
 */
async function navigateToNextStep({ page, nextButtonTestId = 'upload-next-button' }) {
  const nextButton = page.getByTestId(nextButtonTestId);
  await expect(nextButton).toBeVisible();
  await nextButton.click();
}

/**
 * Navigates to the previous step in a stepper
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} [params.previousButtonTestId='upload-previous-button'] - The test ID of the previous button
 * @returns {Promise<void>}
 */
async function navigateToPreviousStep({ page, previousButtonTestId = 'upload-previous-button' }) {
  const previousButton = page.getByTestId(previousButtonTestId);
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
async function verifyStepButtonState({
  page,
  stepIndex,
  shouldBeEnabled,
}) {
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
