import { attachmentsDir } from './playwright.config';

const { expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

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

const createAttachmentDirectory = async ({ directory, path: subPath }) => {
  if (!directory) {
    throw new Error('Directory name must be provided');
  }

  const baseAttachmentDir = attachmentsDir;
  const fullPath = subPath
    ? path.join(baseAttachmentDir, subPath, directory)
    : path.join(baseAttachmentDir, directory);

  try {
    await fs.mkdir(fullPath, { recursive: true });
    // console.log(`Created attachment directory: ${fullPath}`);
    return fullPath;
  } catch (error) {
    console.error(`Error creating attachment directory: ${error.message}`);
    throw error;
  }
};

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,
  createAttachmentDirectory,
};
