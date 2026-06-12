/**
 * src/notification/email-preview/vite.config.js
 *
 * Vite dev-server for live email template previewing.
 *
 *   npm run email:dev   (from api/)
 *
 * How it works:
 *  - Custom plugin adds three middleware routes:
 *      GET  /api/templates          → JSON list of template names
 *      GET  /api/fixtures/:name     → JSON list of fixture names for template
 *      GET  /preview/:name          → fully rendered template HTML
 *  - Watches *.mjml.hbs and fixtures/*.json for changes.
 *  - On change, sends a `email-update` custom HMR event so the
 *    browser reloads only the active template iframe (no full page reload).
 */

const path = require('path');
const fs = require('fs');
const Handlebars = require('handlebars');
// eslint-disable-next-line import/no-extraneous-dependencies
const { defineConfig } = require('vite');
const mjml2html = require('mjml');

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function listTemplateNames() {
  return fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.endsWith('.mjml.hbs') && fileName !== 'base.mjml.hbs')
    .map((fileName) => fileName.replace(/\.mjml\.hbs$/, ''))
    .sort((a, b) => a.localeCompare(b));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readFixtureMap(templateName) {
  const fixturePath = path.join(FIXTURES_DIR, `${templateName}.json`);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}\nCreate fixtures/${templateName}.json with sample data.`);
  }

  const fixtureJson = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  if (!isPlainObject(fixtureJson)) {
    throw new Error(`Fixture file must contain an object: ${fixturePath}`);
  }

  const fixtureNames = Object.keys(fixtureJson);
  const isNamedFixtureMap = fixtureNames.length > 0
    && fixtureNames.every((fixtureName) => isPlainObject(fixtureJson[fixtureName]));

  return isNamedFixtureMap ? fixtureJson : { default: fixtureJson };
}

function listFixtureNames(templateName) {
  return Object.keys(readFixtureMap(templateName));
}

function loadFixtureData(templateName, requestedFixtureName) {
  const fixtureMap = readFixtureMap(templateName);
  const fixtureNames = Object.keys(fixtureMap);

  if (!fixtureNames.length) {
    throw new Error(`No fixtures found for template "${templateName}".`);
  }

  const fixtureName = requestedFixtureName || fixtureNames[0];
  if (!Object.prototype.hasOwnProperty.call(fixtureMap, fixtureName)) {
    throw new Error(
      `Fixture "${fixtureName}" not found for template "${templateName}". `
      + `Available fixtures: ${fixtureNames.join(', ')}`,
    );
  }

  return { fixtureName, data: fixtureMap[fixtureName] };
}

// ── Handlebars helpers (mirrors templateRenderer.js) ─────────────────────────

Handlebars.registerHelper('formatDate', (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
});

Handlebars.registerHelper('ifEq', function ifEq(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

// ── Template renderer ─────────────────────────────────────────────────────────

/**
 * Compile a single template with its fixture data.
 * Always reads files fresh from disk so changes are picked up immediately.
 *
 * @param {string} name  e.g. "alert"
 * @param {string | null} fixtureName  e.g. "approved"
 * @returns {Promise<{ html: string, errors: any[], fixtureName: string }>}
 */
async function compileTemplate(name, fixtureName = null) {
  const { data, fixtureName: resolvedFixtureName } = loadFixtureData(name, fixtureName);
  const baseSource = fs.readFileSync(path.join(TEMPLATES_DIR, 'base.mjml.hbs'), 'utf-8');
  const bodySource = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.mjml.hbs`), 'utf-8');

  const renderBase = Handlebars.compile(baseSource);
  const renderBody = Handlebars.compile(bodySource);

  const bodyMjml = renderBody(data);
  const fullMjml = renderBase({ ...data, body: bodyMjml, year: new Date().getFullYear() });

  // mjml v5 returns a Promise; v4 returns synchronously – handle both.
  const result = await Promise.resolve(mjml2html(fullMjml, { validationLevel: 'soft' }));

  return { html: result.html, errors: result.errors ?? [], fixtureName: resolvedFixtureName };
}

// ── Vite plugin ───────────────────────────────────────────────────────────────

function emailPreviewPlugin() {
  return {
    name: 'email-preview',

    configureServer(server) {
      // ── /api/templates – list available template names ──────────────────
      server.middlewares.use('/api/templates', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(listTemplateNames()));
      });

      // ── /api/fixtures/:name – list fixture names for a template ─────────
      server.middlewares.use('/api/fixtures', (req, res, next) => {
        const fixtureUrl = new URL(req.url ?? '/', 'http://email-preview.local');
        const name = decodeURIComponent(fixtureUrl.pathname.replace(/^\//, ''));
        if (!name || !listTemplateNames().includes(name)) return next();

        try {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(listFixtureNames(name)));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // ── /preview/:name – render template with fixture data ──────────────
      server.middlewares.use('/preview', async (req, res, next) => {
        const previewUrl = new URL(req.url ?? '/', 'http://email-preview.local');
        const name = decodeURIComponent(previewUrl.pathname.replace(/^\//, ''));
        const fixtureName = previewUrl.searchParams.get('fixture');
        if (!name || !listTemplateNames().includes(name)) return next();

        try {
          const { html, errors, fixtureName: resolvedFixtureName } = await compileTemplate(name, fixtureName);
          if (errors.length) {
            server.config.logger.warn(
              `[email-preview] MJML warnings for "${name}/${resolvedFixtureName}": ${JSON.stringify(errors)}`,
            );
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(
            '<!DOCTYPE html><html><body>'
            + '<pre style="color:#dc2626;font-family:monospace;padding:2rem;white-space:pre-wrap">'
            + `<strong>Template compilation error</strong>\n\n${err.message}\n\n${err.stack}`
            + '</pre></body></html>',
          );
        }
      });

      // ── File watcher → HMR ──────────────────────────────────────────────
      const globPatterns = [
        path.join(TEMPLATES_DIR, '*.mjml.hbs'),
        path.join(FIXTURES_DIR, '*.json'),
      ];
      server.watcher.add(globPatterns);

      server.watcher.on('change', (file) => {
        const base = path.basename(file);
        // Determine which template names are affected
        let affected;
        if (base === 'base.mjml.hbs') {
          // base layout change affects every template
          affected = listTemplateNames();
        } else {
          // Strip extensions: "alert.mjml.hbs" → "alert", "alert.json" → "alert"
          const stem = base.replace(/\.mjml\.hbs$/, '').replace(/\.json$/, '');
          const templateNames = listTemplateNames();
          affected = templateNames.includes(stem) ? [stem] : templateNames;
        }

        // eslint-disable-next-line no-restricted-syntax
        for (const name of affected) {
          server.ws.send({ type: 'custom', event: 'email-update', data: { name } });
        }

        server.config.logger.info(
          `\x1b[36m[email-preview]\x1b[0m ${base} changed → HMR sent for: ${affected.join(', ')}`,
        );
      });
    },
  };
}

// ── Vite config ───────────────────────────────────────────────────────────────

module.exports = defineConfig({
  root: __dirname,
  plugins: [emailPreviewPlugin()],
  server: {
    port: 5179,
    open: '/',
    strictPort: false,
  },
});
