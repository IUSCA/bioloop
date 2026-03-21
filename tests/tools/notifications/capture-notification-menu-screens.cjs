/**
 * Logs in via CI mock CAS (ticket=role), opens the notifications dropdown,
 * and saves PNGs cropped to the notification bell + panel, plus the user
 * avatar/username column (excluding CI badge and theme toggle between them).
 *
 * Also writes short GIFs for interactions that are easier to see in motion.
 *
 * Usage (from repo root, e2e stack up on 24443):
 *   node tests/tools/capture-notification-menu-screens.cjs
 *
 * Requires ImageMagick (`magick`) on PATH for compositing and GIF output.
 *
 * Env:
 *   CAPTURE_BASE_URL  default https://localhost:24443
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BASE = process.env.CAPTURE_BASE_URL || 'https://localhost:24443';
const OUT = path.join(__dirname, '..', 'screenshots', 'notification-menu-manual');
const CLIP_PAD_PX = 10;

async function login(page, ticket) {
  await page.goto(`${BASE}/auth/iucas?ticket=${ticket}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.getByTestId('header-username').waitFor({ state: 'visible', timeout: 120000 });
}

async function openMenu(page) {
  const bell = page.getByTestId('notification-open-button');
  const panel = page.getByTestId('notification-menu-items');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await bell.click({ timeout: 15000 });
    try {
      await panel.waitFor({ state: 'visible', timeout: 20000 });
      await page.getByTestId('filter-unread').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(600);
      return;
    } catch {
      await page.waitForTimeout(600);
    }
  }
  throw new Error('notification menu did not open');
}

async function ensureNotificationMenuOpen(page) {
  const bell = page.getByTestId('notification-open-button');
  const unread = page.getByTestId('filter-unread');
  if (await unread.isVisible().catch(() => false)) return;
  await bell.click({ timeout: 15000 });
  await unread.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(450);
}

async function clearFilters(page) {
  const btn = page.getByTestId('clear-notification-filters');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(400);
  }
}

async function bellOnlyClip(page, pad) {
  return page.evaluate(({ p }) => {
    const bell = document.querySelector('[data-testid="notification-open-button"]');
    if (!bell) return null;
    const b = bell.getBoundingClientRect();
    if (b.width <= 0 && b.height <= 0) return null;
    let x = Math.floor(b.left - p);
    let y = Math.floor(b.top - p);
    let width = Math.ceil(b.width + 2 * p);
    let height = Math.ceil(b.height + 2 * p);
    x = Math.max(0, x);
    y = Math.max(0, y);
    width = Math.min(width, window.innerWidth - x);
    height = Math.min(height, window.innerHeight - y);
    return { x, y, width, height };
  }, { p: pad });
}

async function menuPanelClip(page, pad) {
  return page.evaluate((p) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clipFromEl = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) return null;
      let x = Math.max(0, Math.floor(r.left - p));
      let y = Math.max(0, Math.floor(r.top - p));
      let width = Math.ceil(r.width + 2 * p);
      let height = Math.ceil(r.height + 2 * p);
      width = Math.min(width, vw - x);
      height = Math.min(height, vh - y);
      return { x, y, width, height };
    };
    for (const sel of ['[data-testid="notification-menu-items"]', '.notification-menu-panel']) {
      for (const el of document.querySelectorAll(sel)) {
        const c = clipFromEl(el);
        if (c) return c;
      }
    }
    const btn = document.querySelector('[data-testid="filter-unread"]');
    for (let el = btn && btn.parentElement; el; el = el.parentElement) {
      if (
        el.getAttribute('data-testid') === 'notification-menu-items' ||
        el.classList?.contains('notification-menu-panel')
      ) {
        const c = clipFromEl(el);
        if (c) return c;
      }
    }
    return null;
  }, pad);
}

async function userAvatarUsernameClip(page, pad) {
  const clip = await page.evaluate(({ p }) => {
    const name = document.querySelector('[data-testid="header-username"]');
    if (!name || !name.parentElement) return null;
    const el = name.parentElement;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return null;
    let x = Math.floor(r.left - p);
    let y = Math.floor(r.top - p);
    let width = Math.ceil(r.width + 2 * p);
    let height = Math.ceil(r.height + 2 * p);
    x = Math.max(0, x);
    y = Math.max(0, y);
    width = Math.min(width, window.innerWidth - x);
    height = Math.min(height, window.innerHeight - y);
    return { x, y, width, height };
  }, { p: pad });
  return clip;
}

function magickAvailable() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Menu column (bell + dropdown) | user column (avatar + username), same total height.
 */
function magickImageHeight(pngPath) {
  const out = execFileSync('magick', ['identify', '-format', '%h', pngPath], { encoding: 'utf8' });
  return parseInt(out.trim(), 10);
}

/**
 * Left column: bell (narrow) stacked above full-width menu panel — avoids
 * drawing a single rectangle from the panel’s left edge through the CI strip.
 * Right column: avatar + username, height matched to the left column.
 */
async function compositeMenuAndUserPng(page, outPath, { quiet = false } = {}) {
  if (!magickAvailable()) {
    throw new Error('ImageMagick (magick) is required for menu+user compositing.');
  }
  await ensureNotificationMenuOpen(page);
  let menuClip = null;
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    menuClip = await menuPanelClip(page, CLIP_PAD_PX);
    if (menuClip && menuClip.width > 2) break;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(150);
  }
  if (!menuClip || menuClip.width < 2) {
    await openMenu(page);
    menuClip = await menuPanelClip(page, CLIP_PAD_PX);
  }
  const bellClip = await bellOnlyClip(page, CLIP_PAD_PX);
  const userClip = await userAvatarUsernameClip(page, CLIP_PAD_PX);
  if (!bellClip || !menuClip || !userClip || menuClip.width < 2 || userClip.width < 2) {
    throw new Error(`Bad clip bell=${JSON.stringify(bellClip)} menu=${JSON.stringify(menuClip)} user=${JSON.stringify(userClip)}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-comp-'));
  const bellPng = path.join(tmpDir, 'b.png');
  const menuPng = path.join(tmpDir, 'm.png');
  const colLeft = path.join(tmpDir, 'left.png');
  const userPng = path.join(tmpDir, 'u.png');
  const userExt = path.join(tmpDir, 'ue.png');

  try {
    await page.screenshot({ path: bellPng, clip: bellClip });
    await page.screenshot({ path: menuPng, clip: menuClip });
    execFileSync('magick', [bellPng, menuPng, '-append', colLeft]);

    const leftH = magickImageHeight(colLeft);
    const uw = userClip.width;
    await page.screenshot({ path: userPng, clip: userClip });
    execFileSync('magick', [
      userPng,
      '-background', 'white',
      '-gravity', 'north',
      '-extent', `${uw}x${leftH}`,
      userExt,
    ]);
    execFileSync('magick', [colLeft, userExt, '+append', '-gravity', 'North', outPath]);
    if (!quiet) console.log('wrote', outPath);
  } finally {
    for (const f of [bellPng, menuPng, colLeft, userPng, userExt]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

async function shotCropped(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await compositeMenuAndUserPng(page, file);
}

function writeGifFromPngFrames(framePaths, outGifPath) {
  if (framePaths.length === 0) return;
  execFileSync('magick', [
    '-delay', '18',
    '-loop', '0',
    ...framePaths,
    outGifPath,
  ]);
  console.log('wrote', outGifPath);
}

async function recordGif(page, baseName, fn) {
  if (!magickAvailable()) {
    console.warn('magick not found; skip GIF', baseName);
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-gif-'));
  const frames = [];
  let idx = 0;

  const capture = async () => {
    const fp = path.join(tmpDir, `f${String(idx).padStart(4, '0')}.png`);
    idx += 1;
    await compositeMenuAndUserPng(page, fp, { quiet: true });
    frames.push(fp);
  };

  try {
    await fn(capture);
    if (frames.length >= 2) {
      writeGifFromPngFrames(frames, path.join(OUT, `${baseName}.gif`));
    } else {
      console.warn('GIF skipped (need 2+ frames):', baseName);
    }
  } finally {
    for (const fp of frames) {
      try {
        fs.unlinkSync(fp);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  if (!magickAvailable()) {
    console.error('ImageMagick (`magick`) is required. Install it and re-run.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1360, height: 900 },
  });

  {
    const page = await context.newPage();
    await login(page, 'admin');
    await openMenu(page);
    await clearFilters(page);
    await shotCropped(page, '01-admin-default-menu');

    await page.getByTestId('filter-unread').click();
    await page.waitForTimeout(400);
    await shotCropped(page, '02-admin-filter-unread-only');

    await clearFilters(page);
    await page.getByTestId('filter-archived').click();
    await page.waitForTimeout(400);
    await shotCropped(page, '03-admin-filter-archived-only');

    await clearFilters(page);
    await page.getByTestId('filter-read').click();
    await page.getByTestId('filter-bookmarked').click();
    await page.waitForTimeout(400);
    await shotCropped(page, '04-admin-filter-read-and-bookmarked');

    await clearFilters(page);
    await page.getByTestId('filter-unread').click();
    await page.getByPlaceholder('Search notifications').fill('quota');
    await page.waitForTimeout(500);
    await shotCropped(page, '05-admin-unread-filter-search-quota');

    const panel = page.getByTestId('notification-menu-items');
    await clearFilters(page);
    await page.getByPlaceholder('Search notifications').fill('');
    await page.waitForTimeout(300);
    await panel.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(200);
    await shotCropped(page, '06-admin-menu-scrolled-top-role-broadcasts');

    await panel.evaluate((el) => { el.scrollTop = 320; });
    await page.waitForTimeout(200);
    await shotCropped(page, '07-admin-menu-scrolled-mid-role-broadcasts');

    const dismissBtns = page.locator('[data-testid$="-global-dismiss"]');
    const n = await dismissBtns.count();
    for (let i = 0; i < Math.min(3, n); i += 1) {
      await dismissBtns.nth(i).click();
      await page.waitForTimeout(450);
    }
    await page.getByTestId('filter-globally-dismissed').click();
    await page.waitForTimeout(500);
    await shotCropped(page, '08-admin-globally-dismissed-filter-active');

    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, 'operator');
    await openMenu(page);
    await clearFilters(page);
    await shotCropped(page, '09-operator-default-role-broadcasts');

    await page.getByTestId('filter-bookmarked').click();
    await page.waitForTimeout(400);
    await shotCropped(page, '10-operator-filter-bookmarked-only');

    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, 'user');
    await openMenu(page);
    await clearFilters(page);
    await shotCropped(page, '11-user-default-role-broadcasts');

    await page.getByTestId('filter-unread').click();
    await page.waitForTimeout(400);
    await shotCropped(page, '12-user-filter-unread-role-broadcasts-visible');

    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, 'admin');
    await openMenu(page);
    await clearFilters(page);

    await recordGif(page, 'gif-admin-open-and-filter-cycle', async (cap) => {
      await cap();
      await page.getByTestId('filter-unread').click();
      await page.waitForTimeout(350);
      await cap();
      await clearFilters(page);
      await page.waitForTimeout(350);
      await cap();
      await page.getByTestId('filter-read').click();
      await page.waitForTimeout(250);
      await page.getByTestId('filter-archived').click();
      await page.waitForTimeout(350);
      await cap();
      await clearFilters(page);
      await page.waitForTimeout(350);
      await cap();
    });
    await page.close();
  }

  await new Promise((r) => { setTimeout(r, 1000); });

  {
    const page = await context.newPage();
    await login(page, 'admin');
    await openMenu(page);
    await clearFilters(page);

    await recordGif(page, 'gif-admin-search-quota', async (cap) => {
      await cap();
      const search = page.getByPlaceholder('Search notifications');
      await search.click();
      await page.waitForTimeout(200);
      await cap();
      await search.pressSequentially('quota', { delay: 80 });
      await page.waitForTimeout(500);
      await cap();
      await clearFilters(page);
      await page.waitForTimeout(350);
      await cap();
    });
    await page.close();
  }

  await new Promise((r) => { setTimeout(r, 1000); });

  {
    const page = await context.newPage();
    await login(page, 'admin');
    await openMenu(page);
    await clearFilters(page);

    await recordGif(page, 'gif-admin-scroll-menu-panel', async (cap) => {
      const p = page.getByTestId('notification-menu-items');
      await cap();
      await p.evaluate((el) => { el.scrollTop = 180; });
      await page.waitForTimeout(250);
      await cap();
      await p.evaluate((el) => { el.scrollTop = 420; });
      await page.waitForTimeout(250);
      await cap();
      await p.evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(250);
      await cap();
    });
    await page.close();
  }

  await new Promise((r) => { setTimeout(r, 1000); });

  {
    const page = await context.newPage();
    await login(page, 'admin');
    await openMenu(page);
    await clearFilters(page);

    await recordGif(page, 'gif-admin-global-dismiss-and-filter', async (cap) => {
      await cap();
      const btn = page.locator('[data-testid$="-global-dismiss"]').first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        await cap();
      }
      await page.getByTestId('filter-globally-dismissed').click();
      await page.waitForTimeout(450);
      await cap();
      await clearFilters(page);
      await page.waitForTimeout(350);
      await cap();
    });
    await page.close();
  }

  await browser.close();
  console.log('Done. Output directory:', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
