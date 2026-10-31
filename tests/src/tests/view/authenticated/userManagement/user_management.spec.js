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

function getUserFormLocators(page) {
  return {
    name: page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_NAME,
    })),
    username: page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_USERNAME,
    })),
    email: page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_EMAIL,
    })),
    casId: page.locator(elementTestIdSelector({
      elementType: 'input',
      testId: TEST_ID_CAS_ID,
    })),
    notes: page.locator(elementTestIdSelector({
      elementType: 'textarea',
      testId: TEST_ID_NOTES,
    })),
  };
}

test.describe.serial('User management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');

    await expect(page.getByTestId(TEST_ID_MODAL)).not.toBeVisible();
    // following tests will run with the modal open
    await page.getByTestId('create-user-button').click();
    await expect(page.getByTestId(TEST_ID_MODAL)).toBeVisible();
  });

  test('Create User modal opened', async ({ page }) => {
    const { notes } = getUserFormLocators(page);

    await expect(page.getByTestId(TEST_ID_NAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_EMAIL)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_USERNAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_CAS_ID)).toHaveText('');
    await expect(notes).toHaveText('');
  });

  test('Cancel Modal action taken', async ({ page }) => {
    const {
      name, username, email, casId, notes,
    } = getUserFormLocators(page);

    // fill-in fields
    await fillAndAssertText({
      locator: name, text: TEXT,
    });
    await fillAndAssertText({
      locator: username, text: TEXT,
    });
    await fillAndAssertText({
      locator: email, text: TEXT,
    });
    await fillAndAssertText({
      locator: casId, text: TEXT,
    });
    await fillAndAssertText({
      locator: notes, text: TEXT,
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
    await expect(notes).toHaveText('');
  });

  test('User created', async ({ page }) => {
    const { name, email, notes } = getUserFormLocators(page);

    // fill-in fields
    await fillAndAssertText({
      locator: name, text: TEST_USER.name,
    });
    await fillAndAssertText({
      locator: email, text: TEST_USER.email,
    });
    await fillAndAssertText({
      locator: notes, text: TEST_USER.notes,
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
    await expect(notes).toHaveText('');
  });
});
