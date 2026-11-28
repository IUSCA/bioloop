const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  createDirectNotification,
  ensureNotificationsMenuOpen,
  ensureNotificationOpenButtonVisible,
  fetchCurrentUser,
  openNotificationsMenu,
  visibleNotificationMenu,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

test.describe.serial('Notifications responsive layout', () => {
  test.describe.configure({ timeout: 90000 });

  test.beforeEach(async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
  });

  test('menu width stays deterministic and top controls follow breakpoint columns', async ({ page }) => {
    const cases = [
      { width: 700, expectedColumns: 3, expectedMenuWidth: 448 },
      { width: 900, expectedColumns: 5, expectedMenuWidth: 512 },
      { width: 1100, expectedColumns: 5, expectedMenuWidth: 576 },
    ];

    for (const c of cases) {
      await page.setViewportSize({ width: c.width, height: 900 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureNotificationOpenButtonVisible(page);
      await ensureNotificationsMenuOpen(page);
      const menu = visibleNotificationMenu(page);
      await expect(menu).toBeAttached({ timeout: 20000 });
      await expect(menu.locator('.notification-top-controls')).toBeAttached({ timeout: 20000 });

      // eslint-disable-next-line no-await-in-loop
      const layout = await page.evaluate(() => {
        const roots = Array.from(document.querySelectorAll('.notification-dropdown-root'));
        let panel = null;
        for (const root of roots) {
          const candidate = root.querySelector('[data-testid="notification-menu-items"]');
          if (!(candidate instanceof HTMLElement)) continue;
          const r = candidate.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            panel = candidate;
            break;
          }
        }
        const controls = panel?.querySelector('.notification-top-controls') ?? null;
        const panelRect = panel?.getBoundingClientRect();
        const controlsStyle = controls ? window.getComputedStyle(controls) : null;
        const gtc = controlsStyle?.gridTemplateColumns || '';
        const cols = gtc && gtc !== 'none' ? gtc.trim().split(/\s+/).length : 0;
        return {
          panelWidth: panelRect?.width || 0,
          columns: cols,
        };
      });

      // eslint-disable-next-line no-await-in-loop
      expect(layout.columns).toBe(c.expectedColumns);
      // Fixed widths can vary by subpixel rounding; allow 2px tolerance.
      // eslint-disable-next-line no-await-in-loop
      expect(Math.abs(layout.panelWidth - c.expectedMenuWidth)).toBeLessThanOrEqual(2);
    }
  });

  test('per-notification action controls stay equal-width in one row across breakpoints', async ({ page }) => {
    const { token, userId } = await fetchCurrentUser({ page });
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-responsive-actions-${suffix}`,
      text: `responsive-actions-${suffix}`,
    });

    const viewports = [
      { width: 700, height: 900 },
      { width: 1100, height: 900 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureNotificationOpenButtonVisible(page);
      await openNotificationsMenu(page);

      const rowLabel = page.getByTestId(`notification-${created.id}-label`);
      // eslint-disable-next-line no-await-in-loop
      await expect(rowLabel).toBeVisible();

      // eslint-disable-next-line no-await-in-loop
      const metrics = await page.evaluate((id) => {
        const read = document.querySelector(`[data-testid="notification-${id}-toggle-read"]`);
        const bookmark = document.querySelector(`[data-testid="notification-${id}-toggle-bookmark"]`);
        const buttons = [read, bookmark].filter(Boolean);
        const rects = buttons.map((b) => b.getBoundingClientRect());
        return {
          count: buttons.length,
          widths: rects.map((r) => r.width),
          ys: rects.map((r) => r.y),
        };
      }, created.id);

      // Admin/operator view should expose read and bookmark actions in one row.
      // eslint-disable-next-line no-await-in-loop
      expect(metrics.count).toBe(2);
      // eslint-disable-next-line no-await-in-loop
      expect(Math.max(...metrics.widths) - Math.min(...metrics.widths)).toBeLessThanOrEqual(2);
      // Same-row check: all buttons share effectively the same y-position.
      // eslint-disable-next-line no-await-in-loop
      expect(Math.max(...metrics.ys) - Math.min(...metrics.ys)).toBeLessThanOrEqual(2);
    }
  });
});
