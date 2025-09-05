# Attachment-Based Tests

Our E2E suite has the ability to dynamically create, use, and clean up file attachments for tests that need them.

---

## What Problem Does It Solve?

When a test needs to use attachment files, we don’t want to:

- Store static test files in the repo
- Share files across tests (which risks cross-test pollution)
- Manually manage cleanup after test runs

Instead, this system:

- Dynamically creates files just before each test runs
- Keeps each tests' attachment files isolated
- Deletes everything when the test completes

---

## The two Key Pieces

### 1. `AttachmentManager` Class

**File:** `utils/attachments/manager.js`

A wrapper around Node.js file APIs to:

- Create a unique directory to contain this test's attachments
- Create files
- Clean everything up after the test

Example:

```js
// instantiate
const attachmentManager = new AttachmentManager('/path/to/directory')

// create container directory for your test's attachments
await attachmentManager.setup();

// create attachment file
await attachmentManager.createFile('file.txt', 'Some content');

// delete container directory for your test's attachments
await attachmentManager.teardown();
```

---

### 2. `withAttachment` Fixture

**File:** `fixtures/withAttachments.js`

This Playwright fixture acts as the bridge between Playwright and `attachmentManager`.

- Sets up the attachments directory based on the test file's path
- Creates any attachment files defined in the test
- Cleans everything up after the test file is done
- Exposes an `attachmentManager` instance to the test context

Using a fixture avoids having to duplicate boilperplate code for setup, file-creation and teardown in each test.

#### Arguments:

- Accepts the test file path (`__filename`)
- Accepts a list of file-definitions (`{ name, content }`)

#### Returns:
- Returns a Playwright `test` instance that automatically uses the `withAttachment` fixture

Any test that needs to use attachments can opt in to this system by using this fixture.

```js
// returns Playwright `test` instance which has now been setup to use attachments
const test = withAttachments(
    test: baseTest,
    filePath: __filename,
    attachments: [
        { name: 'myFile.txt', content: 'this is my file' },
        { name: 'myFile2.txt', content: 'this is my second file' }
    ]
);
// this `test` object can now be used in the rest of your test

```

---

### Example

```js
// File: tests/upload/test_upload.spec.js

import { expect, test as baseTest } from '@playwright/test';

import { withAttachments } from '../../../../fixtures/withAttachments';

// Opt in to the attachment framework via the withAttachments fixture
const test = withAttachments(
    {
        test: baseTest,
        filePath: __filename,
        attachments: [
            { name: 'myFile.txt', content: 'this is my file' }
        ]
    }
);

test('uploads file using attachmentManager', async ({ page, attachmentManager }) => {
    const filePath = `${attachmentManager.getPath()}/myFile.txt`;

    await page.goto('/upload');

    // select files
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#select-file')
    ]);
    await fileChooser.setFiles(filePath);

    await expect(page.locator('#file-uploaded')).toContainText('myFile.txt');
});
```

---

## Folder Structure

If your test is `tests/upload/test_upload.spec.js`, this setup creates:

```
tests/
├── upload/
│   ├── test_upload.spec.js
│   └── attachments/
│       └── test_upload/
│           └── myFile.txt
```

Then it deletes this folder after the test run completes.

---

## Summary

| Component           | Role                                      |
| ------------------- | ----------------------------------------- |
| `AttachmentManager` | File system helper for setup/teardown     |
| Fixture             | Creates & cleans up per-test file folders |
| `withAttachments()` | Passes metadata into the fixture cleanly  |
| Test File           | Calls into `attachmentManager` in tests   |

This setup keeps tests' attachments clean, dynamic, and isolated.