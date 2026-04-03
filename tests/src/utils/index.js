const { expect } = require('@playwright/test');

/** @param {string} testId @returns {string} `[data-testid=...]` selector. */
const testIdSelector = (testId) => `[data-testid=${testId}]`;

/**
 * Builds a selector scoped by HTML element type and `data-testid`.
 * @param {{elementType?: string|null, testId: string}} params
 * @returns {string}
 */
const elementTestIdSelector = ({ elementType = null, testId }) => (elementType ? `${elementType}${testIdSelector(testId)}` : `div${testIdSelector(testId)}`);

/**
 * Fills a locator with text.
 * @param {{locator: import('@playwright/test').Locator, text: string}} params
 * @returns {Promise<void>}
 */
const fillText = async ({ locator, text }) => {
  await locator.fill(text);
};

/**
 * Fills a locator and asserts the resulting input value.
 * @param {{locator: import('@playwright/test').Locator, text: string}} params
 * @returns {Promise<void>}
 */
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

/**
 * Converts base64url encoding into standard base64 encoding.
 * @param {string} value
 * @returns {string}
 */
const base64UrlToBase64 = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return normalized.padEnd(normalized.length + paddingLength, '=');
};

/**
 * Parses the payload section of a JWT token.
 * Returns `null` for missing/invalid tokens.
 *
 * @param {string|null|undefined} token
 * @returns {Record<string, any>|null}
 */
const extractTokenPayload = (token) => {
  if (!token) {
    return null;
  }

  const [, payload = ''] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(
      base64UrlToBase64(payload),
      'base64',
    ).toString('utf8'));
    return decoded;
  } catch (error) {
    return null;
  }
};

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,
  cleanDropdownOptionText,
  extractTokenPayload,
};
