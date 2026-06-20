/**
 * src/notification/email/templateRenderer.js
 *
 * Compiles and caches Handlebars templates.
 * Templates live in src/notification/templates/*.hbs
 *
 * Each notification type has its own body template.
 * All body templates are injected into base.hbs which provides
 * the shared header, footer, and styles.
 */

const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const mjml2html = require('mjml');
const { convert: htmlToText } = require('html-to-text');
const logger = require('@/services/logger');

const TEMPLATES_DIR = path.join(__dirname, '../templates');
const _cache = new Map();

// ── Handlebars helpers ─────────────────────────────────────────────

Handlebars.registerHelper('formatDate', (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
});

// {{ifEq value "expected"}}...{{else}}...{{/ifEq}}
Handlebars.registerHelper('ifEq', (a, b, options) => (a === b ? options.fn(this) : options.inverse(this)));

// ── Template loading ───────────────────────────────────────────────

function loadTemplate(name) {
  if (_cache.has(name)) return _cache.get(name);

  const filePath = path.join(TEMPLATES_DIR, `${name}.mjml.hbs`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Templates] Template file not found: ${filePath}`);
  }

  const compiled = Handlebars.compile(fs.readFileSync(filePath, 'utf-8'));
  _cache.set(name, compiled);
  return compiled;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Render a notification email.
 * Injects the body template into the base layout.
 *
 * @param {string} templateName  - matches a file in templates/ (without .hbs)
 * @param {object} data          - variables available inside the template
 * @returns {{ html: string, text: string }}
 */
async function renderTemplate(templateName, data) {
  const renderBase = loadTemplate('base');
  const renderBody = loadTemplate(templateName);

  // Render the notification-specific body first (produces MJML fragment)
  const bodyMjml = renderBody(data);

  // Inject fragment into the base MJML document
  const fullMjml = renderBase({
    ...data,
    body: bodyMjml,
    year: new Date().getFullYear(),
  });

  // Compile MJML → HTML
  const { html, errors } = await mjml2html(fullMjml, { validationLevel: 'soft' });
  if (errors && errors.length) {
    logger.warn('[Templates] MJML compilation warnings', { template: templateName, errors });
  }

  // console.log(html);

  // Generate plain-text fallback
  const text = htmlToText(html, { wordwrap: 120 });

  // console.log(text);

  return { html, text };
}

/**
 * Pre-compile all templates at worker startup.
 * Prevents first-job latency from cold template compilation.
 */
function preloadTemplates() {
  const names = ['base', 'alert', 'workflow', 'request', 'digest', 'system'];
  let loaded = 0;
  for (const name of names) {
    try {
      loadTemplate(name);
      loaded += 1;
    } catch (err) {
      logger.warn(`[Templates] Could not preload: ${name}`, { error: err.message });
    }
  }
  logger.info('[Templates] Preloaded', { count: loaded });
}

module.exports = { renderTemplate, preloadTemplates };
