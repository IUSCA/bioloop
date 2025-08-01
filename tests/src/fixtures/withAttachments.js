const path = require('path');

const { TestType } = require('@playwright/test');

const { AttachmentManager } = require('../utils/attachments/manager');

/**
 * Prepares a Playwright `test` instance which is preconfigured to use file
 * attachments.
 *
 * @param {Object} options - The options object
 * @param {TestType} options.test - The base Playwright `test` object
 * (could be provided via `@playwright/test`, or through a Playwright fixture)
 * @param {string} options.filePath - Absolute path of the test file (usually passed as
 * `__filename`)
 * @param {Array<{ name: string, content?: string }>} options.attachments - Array of
 * attachment objects to be created before the test runs
 *
 * @returns {TestType} - A new `test` object which has been extended to
 * support attachments
 *
 * @example
 * const test = withAttachments(
 *    {
 *      test: baseTest,
 *      filePath: __filename,
 *      attachments: [
 *        { name: 'file_1.txt' },
 *        { name: 'file_2.txt', content: 'Hello world' },
 *      ]
 *    }
 * );
 */
function withAttachments({ test, filePath, attachments: testAttachments }) {
  return test.extend({
    directory: [path.dirname(filePath), { option: false }],
    testFile: [path.basename(filePath), { option: false }],
    attachments: [testAttachments, { option: true }],

    attachmentManager: async ({ directory, testFile, attachments }, use) => {
      const testFileName = testFile.replace('.spec.js', '');
      const attachmentsDir = path.join(directory, 'attachments', testFileName);

      const attachmentManager = new AttachmentManager(attachmentsDir);

      // create attachment container directory
      await attachmentManager.setup();

      const attachmentsToCreate = attachments.length > 0
        ? attachments
        : [{ name: 'default_attachment.txt', content: 'This is a default attachment' }];

      // create attachments
      await Promise.all(attachmentsToCreate.map(async ({ name, content = `Content for ${name}` }) => {
        await attachmentManager.createFile(name, content);
      }));

      await use(attachmentManager);

      // delete attachment container directory
      await attachmentManager.teardown();
    },
  });
}

export { withAttachments };
