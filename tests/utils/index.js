const { expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

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

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,

};
