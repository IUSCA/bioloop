/**
 * src/notification/email-preview/vite.config.js
 *
 * Vite dev-server for live email template previewing.
 *
 *   npm run email:dev   (from api/)
 *
 * How it works:
 *  - Custom plugin adds two middleware routes:
 *      GET  /api/templates          → JSON list of template names
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
const TEMPLATE_NAMES = ['alert', 'workflow', 'request', 'digest', 'system'];

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
 * @returns {Promise<{ html: string, errors: any[] }>}
 */
async function compileTemplate(name) {
  const fixturePath = path.join(FIXTURES_DIR, `${name}.json`);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}\nCreate fixtures/${name}.json with sample data.`);
  }

  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const baseSource = fs.readFileSync(path.join(TEMPLATES_DIR, 'base.mjml.hbs'), 'utf-8');
  const bodySource = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.mjml.hbs`), 'utf-8');

  const renderBase = Handlebars.compile(baseSource);
  const renderBody = Handlebars.compile(bodySource);

  const bodyMjml = renderBody(data);
  const fullMjml = renderBase({ ...data, body: bodyMjml, year: new Date().getFullYear() });

  // mjml v5 returns a Promise; v4 returns synchronously – handle both.
  const result = await Promise.resolve(mjml2html(fullMjml, { validationLevel: 'soft' }));

  return { html: result.html, errors: result.errors ?? [] };
}

// ── Vite plugin ───────────────────────────────────────────────────────────────

function emailPreviewPlugin() {
  return {
    name: 'email-preview',

    configureServer(server) {
      // ── /api/templates – list available template names ──────────────────
      server.middlewares.use('/api/templates', (_req, res) => {
        const available = TEMPLATE_NAMES.filter((name) => fs.existsSync(path.join(TEMPLATES_DIR, `${name}.mjml.hbs`)));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(available));
      });

      // ── /preview/:name – render template with fixture data ──────────────
      server.middlewares.use('/preview', async (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!name || !TEMPLATE_NAMES.includes(name)) return next();

        try {
          const { html, errors } = await compileTemplate(name);
          if (errors.length) {
            server.config.logger.warn(
              `[email-preview] MJML warnings for "${name}": ${JSON.stringify(errors)}`,
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
          affected = TEMPLATE_NAMES;
        } else {
          // Strip extensions: "alert.mjml.hbs" → "alert", "alert.json" → "alert"
          const stem = base.replace(/\.mjml\.hbs$/, '').replace(/\.json$/, '');
          affected = TEMPLATE_NAMES.includes(stem) ? [stem] : TEMPLATE_NAMES;
        }

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
