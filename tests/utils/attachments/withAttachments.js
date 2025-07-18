const path = require('path');

function withAttachments(test, filePath, attachments) {
  return test.extend({
    directory: [path.dirname(filePath), { option: true }],
    testFile: [path.basename(filePath), { option: true }],
    attachments: [attachments, { option: true }],
  });
}

module.exports = {
  withAttachments,
};
