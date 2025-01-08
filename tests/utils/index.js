const { expect } = require('@playwright/test');
const _ = require('lodash');

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

const objectToQueryParams = (obj) => {
  // remove undefined/null values
  const _obj = _.omit(obj, _.isUndefined);
  // console.log('objectToQueryParams', _obj);
  if (!_obj || Object.entries(_obj).length === 0) {
    return '';
  }
  const entries = Object.entries(_obj);
  // console.log('entries', entries);
  const ret = entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return ret;
};

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,
  objectToQueryParams,
};
