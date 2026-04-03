import fs from 'fs/promises';
import path from 'path';

/**
 * Test attachment file manager scoped to one spec's attachment directory.
 */
class AttachmentManager {
  /**
   * @param {string} directory - Base directory for this test's attachments.
   */
  constructor(directory) {
    this.testAttachmentsDir = path.resolve(directory);
  }

  /** @returns {string} Absolute attachment directory path. */
  getPath() {
    return this.testAttachmentsDir;
  }

  /** @returns {Promise<void>} Ensures attachment directory exists. */
  async setup() {
    await fs.mkdir(this.testAttachmentsDir, { recursive: true });
  }

  /** @returns {Promise<void>} Removes attachment directory recursively. */
  async teardown() {
    await fs.rm(this.testAttachmentsDir, { recursive: true, force: true });
  }

  /**
   * Creates a file under the attachment directory.
   * @param {string} fileName
   * @param {string|Buffer} content
   * @returns {Promise<string>} Absolute path to created file.
   */
  async createFile(fileName, content) {
    const filePath = path.join(this.testAttachmentsDir, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Reads a file from the attachment directory.
   * @param {string} fileName
   * @returns {Promise<string>}
   */
  async readFile(fileName) {
    const filePath = path.join(this.testAttachmentsDir, fileName);
    return fs.readFile(filePath, 'utf-8');
  }
}

module.exports = {
  AttachmentManager,
};
