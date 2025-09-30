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

/**
 * Cleans dropdown option text from a Vuestic Select component by removing
 * Vuestic's check icon suffix
 * @param {string} text - The raw text content from a dropdown option
 * @returns {string} The cleaned text without the check icon suffix
 */
function cleanDropdownOptionText(text) {
  // Vuestic inserts a check icon after the dropdown options' text, which
  // will need to be removed. Therefore, remove trailing ' check'
  return text
    // Remove one or more spaces followed by 'check' at the end of the string
    .replace(/\s+check$/, '')
    .trim();
}

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,
  cleanDropdownOptionText,
};
