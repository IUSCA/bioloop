const path = require('path');

/**
 * Prepares a Playwright `test` instance which is preconfigured to use file
 * attachments.
 *
 * @param {import('@playwright/test').TestType} test - The base Playwright `test` object (could be
 * provided via `@playwright/test`, or through a Playwright fixture)
 * @param {string} filePath - Absolute path of the test file (usually passed as `__filename`)
 * @param {Array<{ name: string, content?: string }>} attachments - Array of attachment objects to
 * be created before the test runs
 *
 * @returns {import('@playwright/test').TestType} - A new `test` object which has been extended to
 * support attachments
 *
 * @example
 * const test = withAttachments(baseTest, __filename, [
 *   { name: 'file_1.txt' },
 *   { name: 'file_2.txt', content: 'Hello world' },
 * ]);
 */
function withAttachments(test, filePath, attachments) {
  if (!test || typeof test.extend !== 'function') {
    throw new Error('[withAttachments] You must pass a valid Playwright `test` object.');
  }

  if (!filePath || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('[withAttachments] You must pass an absolute file path as the second argument.');
  }

  return test.extend({
    directory: [path.dirname(filePath), { option: false }],
    testFile: [path.basename(filePath), { option: false }],
    attachments: [attachments, { option: true }],
  });
}

module.exports = {
  withAttachments,
};
