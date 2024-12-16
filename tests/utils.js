const { expect } = require('@playwright/test');

const testIdSelector = (testId) => `[data-testid=${testId}]`;

const elementTestIdSelector = ({ elementType = null, testId }) => (elementType ? `${elementType}${testIdSelector(testId)}` : `div${testIdSelector(testId)}`);

const fillText = async ({ locator, text }) => {
  await locator.fill(text);
};

const fillAndAssertText = async ({
  locator, text,
}) => {
  await fillText({ locator, text });
  await expect(locator).toHaveValue(text);
};

const queryParamsToURL = (obj) => {
  if (!obj || Object.entries(obj).length === 0) {
    return '';
  }
  const entries = Object.entries(obj);
  return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
};

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,
  queryParamsToURL
};
