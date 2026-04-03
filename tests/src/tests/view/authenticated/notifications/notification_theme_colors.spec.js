const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { buildFeatureEnabledRolesFromEnv } = require('../../../../utils/feature');
const {
  createDirectNotification,
  ensureNotificationsMenuOpen,
  fetchCurrentUser,
  openNotificationsMenu,
  visibleNotificationMenu,
  waitForNotificationMenuListIdle,
} = require('./helpers');

const featureEnabled = buildFeatureEnabledRolesFromEnv().notifications.length > 0;

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
  test.describe.configure({ timeout: 180000 });
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
    const menu = await ensureNotificationsMenuOpen(page);
    await menu.getByTestId('filter-read').click();
    await menu.getByTestId('filter-bookmarked').click();

    await expect(menu.getByTestId('active-filter-chip-read')).toBeVisible();
    await expect(menu.getByTestId('active-filter-chip-bookmarked')).toBeVisible();

    await expectElementColor({
      page,
      locator: menu.getByTestId('filter-read'),
      cssVarName: '--va-info',
    });
    await expectElementColor({
      page,
      locator: menu.getByTestId('filter-bookmarked'),
      cssVarName: '--va-success',
    });

    await expectElementColor({
      page,
      locator: menu.getByTestId('active-filter-chip-read'),
      cssVarName: '--va-info',
    });
    await expectElementColor({
      page,
      locator: menu.getByTestId('active-filter-chip-bookmarked'),
      cssVarName: '--va-success',
    });
  });

  test('notification panel and backdrop are opaque in both light and dark modes', async ({ page }) => {
    const assertPanelMasking = async () => {
      await openNotificationsMenu(page);
      const opacity = await page.evaluate(() => {
        const parseAlpha = (color) => {
          if (!color || color === 'transparent') return 0;
          const rgba = color.match(/^rgba?\(([^)]+)\)$/i);
          if (!rgba) return 1;
          const parts = rgba[1].split(',').map((x) => x.trim());
          return parts.length >= 4 ? Number(parts[3]) : 1;
        };
        const panel = document.querySelector('[data-testid="notification-menu-items"]');
        const backdrop = document.querySelector('[data-testid="notification-menu-backdrop"]');
        if (!(panel instanceof HTMLElement) || !(backdrop instanceof HTMLElement)) {
          return { panelAlpha: 0, backdropAlpha: 0 };
        }
        return {
          panelAlpha: parseAlpha(window.getComputedStyle(panel).backgroundColor),
          backdropAlpha: parseAlpha(window.getComputedStyle(backdrop).backgroundColor),
        };
      });
      expect(opacity.panelAlpha).toBeGreaterThan(0.95);
      expect(opacity.backdropAlpha).toBeGreaterThan(0.1);
    };

    await assertPanelMasking();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('notification-menu-items')).toHaveCount(0);
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.getByTestId('theme-toggle').click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')), {
        timeout: 10000,
      })
      .not.toBe(wasDark);
    await assertPanelMasking();
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
    const menu = await ensureNotificationsMenuOpen(page);
    const scopedSearch = menu.getByPlaceholder('Search notifications').first();
    await scopedSearch.fill(suffix);
    await expect(scopedSearch).toHaveValue(suffix);

    const label = menu.getByTestId(`notification-${created.id}-label`);
    await expect(label).toBeVisible({ timeout: 15000 });

    const row = label.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]');
    await expect(row).not.toContainText('Direct');

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
  });
});
