const { test, expect } = require('@playwright/test');
const { v4: uuidv4 } = require('uuid');

const {
  testIdSelector, elementTestIdSelector, fillAndAssertText,
} = require('../../../../utils');

const TEXT = 'some_text';

const random_username = uuidv4();
const TEST_USER = {
  name: 'Test User',
  username: random_username,
  email: `${random_username}@example.com`,
  cas_id: `${random_username}_cas_id`,
  notes: 'Test user notes',
};

const TEST_ID_MODAL = 'edit-user-modal';
const TEST_ID_NAME = 'user-name-input';
const TEST_ID_USERNAME = 'user-username-input';
const TEST_ID_EMAIL = 'user-email-input';
const TEST_ID_CAS_ID = 'user-cas-id-input';
const TEST_ID_NOTES = 'user-notes-input';

test.describe.serial('User management', () => {
  let userNameInputSelector;
  let userUsernameInputSelector;
  let userEmailInputSelector;
  let userCasIdInputSelector;
  let userNotesInputSelector;

  test.beforeEach(async ({ page }) => {
    await page.goto('/users');

    await expect(page.getByTestId(TEST_ID_MODAL)).not.toBeVisible();
    // following tests will run with the modal open
    await page.getByTestId('create-user-button').click();
    await expect(page.getByTestId(TEST_ID_MODAL)).toBeVisible();
  });

  test('Create User modal opened', async ({ page }) => {
    userNameInputSelector = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_NAME,
    }));
    userUsernameInputSelector = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_USERNAME,
    }));
    userEmailInputSelector = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_EMAIL,
    }));
    userCasIdInputSelector = page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_CAS_ID,
    }));
    userNotesInputSelector = page.locator(elementTestIdSelector({
      elementType: 'textarea',
      testId: TEST_ID_NOTES,
    }));

    await expect(page.getByTestId(TEST_ID_NAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_EMAIL)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_USERNAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_CAS_ID)).toHaveText('');
    await expect(userNotesInputSelector).toHaveText('');
  });

  test('Cancel Modal action taken', async ({ page }) => {
    // fill-in fields
    await fillAndAssertText({
      locator: userNameInputSelector, text: TEXT,
    });
    await fillAndAssertText({
      locator: userUsernameInputSelector, text: TEXT,
    });
    await fillAndAssertText({
      locator: userEmailInputSelector, text: TEXT,
    });
    await fillAndAssertText({
      locator: userCasIdInputSelector, text: TEXT,
    });
    await fillAndAssertText({
      locator: userNotesInputSelector, text: TEXT,
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
    await expect(userNotesInputSelector).toHaveText('');
  });

  test('User created', async ({ page }) => {
    // fill-in fields
    await fillAndAssertText({
      locator: userNameInputSelector, text: TEST_USER.name,
    });
    await fillAndAssertText({
      locator: userEmailInputSelector, text: TEST_USER.email,
    });
    await fillAndAssertText({
      locator: userNotesInputSelector, text: TEST_USER.notes,
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
    await expect(userNotesInputSelector).toHaveText('');
  });
});
