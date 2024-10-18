const { test, expect } = require('@playwright/test');

const TEXT = 'some_text';

const TEST_ID_MODAL = 'edit-user-modal';
const TEST_ID_NAME = 'user-name-input';
const TEST_ID_USERNAME = 'user-username-input';
const TEST_ID_EMAIL = 'user-email-input';
const TEST_ID_CAS_ID = 'user-cas-id-input';
const TEST_ID_NOTES = 'user-notes-input';

const testIdSelector = (testId) => `[data-testid=${testId}]`;
const elementTestIdLocator = ({ elementType = null, testId }) => (elementType ? `${elementType}${testIdSelector(testId)}` : `div${testIdSelector(testId)}`);

test.describe.serial('User management', () => {
  let userNameInputLocator;
  let userUsernameInputLocator;
  let userEmailInputLocator;
  let userCasIdInputLocator;
  let userNotesInputLocator;

  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByTestId(TEST_ID_MODAL)).not.toBeVisible();
    // following tests will run with the modal open
    await page.getByTestId('create-user-button').click();
    await expect(page.getByTestId(TEST_ID_MODAL)).toBeVisible();
  });

  test('Create User modal opened', async ({ page }) => {
    userNameInputLocator = page.locator(elementTestIdLocator({
      elementType: 'input',
      testId: TEST_ID_NAME,
    }));
    userUsernameInputLocator = page.locator(elementTestIdLocator({
      elementType: 'input',
      testId: TEST_ID_USERNAME,
    }));
    userEmailInputLocator = page.locator(elementTestIdLocator({
      elementType: 'input',
      testId: TEST_ID_EMAIL,
    }));
    userCasIdInputLocator = page.locator(elementTestIdLocator({
      elementType: 'input',
      testId: TEST_ID_CAS_ID,
    }));
    userNotesInputLocator = page.locator(elementTestIdLocator({
      elementType: 'textarea',
      testId: TEST_ID_NOTES,
    }));

    await expect(page.getByTestId(TEST_ID_NAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_EMAIL)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_USERNAME)).toHaveText('');
    await expect(page.getByTestId(TEST_ID_CAS_ID)).toHaveText('');
    await expect(userNotesInputLocator).toHaveText('');
  });

  test('Modal fields edited', async () => {
    await fillAndAssertValue({
      locator: userNameInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userUsernameInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userEmailInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userCasIdInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userNotesInputLocator, text: TEXT,
    });
  });

  test('Cancel Modal action taken', async ({ page }) => {
    // fill-in fields
    await fillAndAssertValue({
      locator: userNameInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userUsernameInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userEmailInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
      locator: userCasIdInputLocator, text: TEXT,
    });
    await fillAndAssertValue({
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
    // fill-in fields
    await fillAndAssertValue({
      locator: userNameInputLocator, text: 'firstname lastname',
    });
    await fillAndAssertValue({
      locator: userEmailInputLocator, text: 'firstnameLastname@example.com',
    });
    await fillAndAssertValue({
      locator: userNotesInputLocator, text: 'test notes',
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

const fillAndAssertValue = async ({
  locator, text,
}) => {
  await fillText({ locator, text });
  await expect(locator).toHaveValue(text);
};

const fillText = async ({ locator, text }) => {
  await locator.fill(text);
};
