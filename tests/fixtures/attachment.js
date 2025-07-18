import path from 'path';
import { test as base } from '@playwright/test';

const { AttachmentManager } = require('../utils/attachments');

const test = base.extend({
  directory: [undefined, { option: true }],
  testFile: [undefined, { option: true }],
  attachments: [[], { option: true }],
  // attachmentManager: [undefined, { option: true }],

  attachmentManager: async ({ directory, testFile, attachments }, use) => {
    const testFileName = testFile.replace('.spec.js', '');
    const attachmentsDir = path.join(directory, 'attachments', testFileName);
    const attachmentManager = new AttachmentManager(attachmentsDir);

    // create attachment container directory
    await attachmentManager.setup();

    for (const { name, content = `Content for ${name}` } of attachments) {
      await attachmentManager.createFile(name, content);
    }

    await use(attachmentManager);

    // delete attachment container directory
    await attachmentManager.teardown();
  },
});

export { test };
export { expect } from '@playwright/test';
