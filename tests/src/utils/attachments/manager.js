import fs from 'fs/promises';
import path from 'path';

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
  }

  async createFile(fileName, content) {
    const filePath = path.join(this.testAttachmentsDir, fileName);
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
