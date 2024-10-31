const { expect } = require('@playwright/test');

const testIdSelector = (testId) => `[data-testid=${testId}]`;

const elementTestIdLocator = ({ elementType = null, testId }) => (elementType ? `${elementType}${testIdSelector(testId)}` : `div${testIdSelector(testId)}`);

const fillText = async ({ locator, text }) => {
  await locator.fill(text);
};

const fillAndAssertValue = async ({
  locator, text,
}) => {
  await fillText({ locator, text });
  await expect(locator).toHaveValue(text);
};

module.exports = {
  testIdSelector,
  elementTestIdLocator,
  fillText,
  fillAndAssertValue,
};
