const fs = require('fs/promises');
const path = require('path');

class AttachmentManager {
  constructor(directory) {
    this.testAttachmentsDir = path.resolve(directory);
  }

  getPath() {
    return this.testAttachmentsDir;
  }

  async setup() {
    await fs.mkdir(this.testAttachmentsDir, { recursive: true });
  }

  async teardown() {
    await fs.rm(this.testAttachmentsDir, { recursive: true, force: true });

    const attachmentsRoot = path.dirname(this.testAttachmentsDir);
    try {
      await fs.rmdir(attachmentsRoot);
    } catch (error) {
      // Other tests may still be using the shared attachments directory.
      if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
  }

  async createFile(fileName, content) {
    const filePath = path.join(this.testAttachmentsDir, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async readFile(fileName) {
    const filePath = path.join(this.testAttachmentsDir, fileName);
    return fs.readFile(filePath, 'utf-8');
  }
}

module.exports = {
  AttachmentManager,
};
