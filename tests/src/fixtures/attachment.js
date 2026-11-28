import path from 'path';

const { AttachmentManager } = require('../utils/attachments/manager');

function attachmentFixture() {
  return {
    attachments: [[], { option: true }],

    attachmentManager: async ({ attachments }, use, testInfo) => {
      const testFileName = path.basename(testInfo.file, '.spec.js');
      const attachmentsDir = path.join(
        path.dirname(testInfo.file),
        'attachments',
        testFileName,
      );

      const manager = new AttachmentManager(attachmentsDir);
      await manager.setup();

      const attachmentsToCreate = attachments.length > 0
        ? attachments
        : [{
          name: 'default_attachment.txt',
          content: 'This is a default attachment',
        }];

      await Promise.all(
        attachmentsToCreate.map(({ name, content = `Content for ${name}` }) => manager.createFile(name, content)),
      );

      await use(manager);

      await manager.teardown();
    },
  };
}

export { attachmentFixture };
