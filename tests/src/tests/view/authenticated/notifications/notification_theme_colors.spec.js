const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  createDirectNotification,
  fetchCurrentUser,
  openNotificationsMenu,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

const resolveCssVarColor = async (page, cssVarName) => page.evaluate((name) => {
  const probe = document.createElement('div');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const color = window.getComputedStyle(probe).color;
  probe.remove();
  return color;
}, cssVarName);

const normalizeColor = (value) => String(value || '').replace(/\s+/g, '').toLowerCase();

const expectElementColor = async ({ page, locator, cssVarName }) => {
  const [actual, expected] = await Promise.all([
    locator.evaluate((el) => {
      const target = el.querySelector('button') || el;
      const iconTarget = target.querySelector('i, svg');
      if (iconTarget) {
        const iconColor = window.getComputedStyle(iconTarget).color;
        if (iconColor) return iconColor;
      }
      const color = window.getComputedStyle(target).color;
      if (color) return color;
      return window.getComputedStyle(el).color;
    }),
    resolveCssVarColor(page, cssVarName),
  ]);
  expect(normalizeColor(actual)).toBe(normalizeColor(expected));
};

test.describe.serial('Notifications theme colors', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();
    await openNotificationsMenu(page);
    const clearFiltersBtn = page.getByTestId('clear-notification-filters');
    if (await clearFiltersBtn.count()) {
      await clearFiltersBtn.click();
    }
  });

  test('top controls and active chips keep mapped theme colors', async ({ page }) => {
    await page.getByTestId('filter-read').click();
    await page.getByTestId('filter-archived').click();
    await page.getByTestId('filter-bookmarked').click();
    await page.getByTestId('filter-globally-dismissed').click();

    await expect(page.getByTestId('active-filter-chip-read')).toBeVisible();
    await expect(page.getByTestId('active-filter-chip-archived')).toBeVisible();
    await expect(page.getByTestId('active-filter-chip-bookmarked')).toBeVisible();
    await expect(page.getByTestId('active-filter-chip-globally-dismissed')).toBeVisible();

    await expectElementColor({
      page,
      locator: page.getByTestId('filter-read'),
      cssVarName: '--va-info',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId('filter-archived'),
      cssVarName: '--va-warning',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId('filter-bookmarked'),
      cssVarName: '--va-success',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId('filter-globally-dismissed'),
      cssVarName: '--va-danger',
    });

    await expectElementColor({
      page,
      locator: page.getByTestId('active-filter-chip-read'),
      cssVarName: '--va-info',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId('active-filter-chip-archived'),
      cssVarName: '--va-warning',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId('active-filter-chip-bookmarked'),
      cssVarName: '--va-success',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId('active-filter-chip-globally-dismissed'),
      cssVarName: '--va-danger',
    });
  });

  test('notification action controls keep mapped theme colors', async ({ page }) => {
    const { token, userId } = await fetchCurrentUser({ page });
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-theme-colors-${suffix}`,
      text: `theme-color-${suffix}`,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openNotificationsMenu(page);

    const label = page.getByTestId(`notification-${created.id}-label`);
    await expect(label).toBeVisible();

    const row = label.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]');
    await expect(row).toContainText('Direct');

    await expectElementColor({
      page,
      locator: page.getByTestId(`notification-${created.id}-toggle-read`),
      cssVarName: '--va-info',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId(`notification-${created.id}-toggle-bookmark`),
      cssVarName: '--va-success',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId(`notification-${created.id}-toggle-archive`),
      cssVarName: '--va-warning',
    });
    await expectElementColor({
      page,
      locator: page.getByTestId(`notification-${created.id}-global-dismiss`),
      cssVarName: '--va-danger',
    });
  });
});
