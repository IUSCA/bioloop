import path from 'path';
import { test as base } from '@playwright/test';

const { AttachmentManager } = require('../utils/attachments/manager');

const test = base.extend({
  directory: [undefined, { option: false }],
  testFile: [undefined, { option: false }],
  attachments: [[], { option: true }],

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

export { test };
export { expect } from '@playwright/test';
