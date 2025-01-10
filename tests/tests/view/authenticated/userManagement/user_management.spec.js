const { test, expect } = require('@playwright/test');
const { v4: uuidv4 } = require('uuid');

const {
  testIdSelector, elementTestIdSelector, fillAndAssertText,
} = require('../../../../utils');

const TEXT = 'some_text';

const test_user_username = 'testUser';
const TEST_USER = {
  name: 'Test User',
  username: test_user_username,
  email: `${test_user_username}@example.com`,
  cas_id: `${test_user_username}_cas_id`,
  notes: 'Test user notes',
};

const TEST_ID_MODAL = 'edit-user-modal';
const TEST_ID_NAME = 'user-name-input';
const TEST_ID_USERNAME = 'user-username-input';
const TEST_ID_EMAIL = 'user-email-input';
const TEST_ID_CAS_ID = 'user-cas-id-input';
const TEST_ID_NOTES = 'user-notes-input';

test.describe('User management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');

    await expect(page.getByTestId(TEST_ID_MODAL)).not.toBeVisible();
    // following tests will run with the modal open
    await page.getByTestId('create-user-button').click();
    await expect(page.getByTestId(TEST_ID_MODAL)).toBeVisible();
  });

  test('Create User modal opened', async ({ page }) => {
    const userNotesInputLocator = page.locator(elementTestIdSelector({
      elementType: 'textarea',
      testId: TEST_ID_NOTES,
    }));

    await expect(page.getByTestId(TEST_ID_NAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_EMAIL)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_USERNAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_CAS_ID)).toHaveText('');
    await expect(userNotesInputLocator).toHaveText('');
  });

  test('Cancel Modal action taken', async ({ page }) => {
    const userNameInputLocator = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_NAME,
    }));
    const userUsernameInputLocator = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_USERNAME,
    }));
    const userEmailInputLocator = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_EMAIL,
    }));
    const userCasIdInputLocator = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_CAS_ID,
    }));
    const userNotesInputLocator = page.locator(elementTestIdSelector({
      elementType: 'textarea',
      testId: TEST_ID_NOTES,
    }));

    // fill-in fields
    await fillAndAssertText({
      locator: userNameInputLocator, text: TEXT,
    });
    await fillAndAssertText({
      locator: userUsernameInputLocator, text: TEXT,
    });
    await fillAndAssertText({
      locator: userEmailInputLocator, text: TEXT,
    });
    await fillAndAssertText({
      locator: userCasIdInputLocator, text: TEXT,
    });
    await fillAndAssertText({
      locator: userNotesInputLocator, text: TEXT,
    });

    // close modal
    await page.locator(`${testIdSelector(TEST_ID_MODAL)} [va-child=cancelButton]`).click();
    // open modal again
    await page.getByTestId('create-user-button').click();
    // assert fields are empty
    await expect(page.getByTestId(TEST_ID_NAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_EMAIL)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_USERNAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_CAS_ID)).toHaveText('');
    await expect(userNotesInputLocator).toHaveText('');
  });

  test('User created', async ({ page }) => {
    const userNameInputLocator = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_NAME,
    }));
    const userEmailInputLocator = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_EMAIL,
    }));
    const userNotesInputLocator = page.locator(elementTestIdSelector({
      elementType: 'textarea',
      testId: TEST_ID_NOTES,
    }));

    // fill-in fields
    await fillAndAssertText({
      locator: userNameInputLocator, text: TEST_USER.name,
    });
    await fillAndAssertText({
      locator: userEmailInputLocator, text: TEST_USER.email,
    });
    await fillAndAssertText({
      locator: userNotesInputLocator, text: TEST_USER.notes,
    });

    // submit form
    await page.locator(`${testIdSelector(TEST_ID_MODAL)} [va-child=okButton]`).click();
    // open modal again
    await page.getByTestId('create-user-button').click();
    // assert fields are empty
    await expect(page.getByTestId(TEST_ID_NAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_EMAIL)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_USERNAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_CAS_ID)).toHaveText('');
    await expect(userNotesInputLocator).toHaveText('');
  });
});
