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

  const filePath = path.join(TEMPLATES_DIR, `${name}.hbs`);
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
function renderTemplate(templateName, data) {
  const renderBase = loadTemplate('base');
  const renderBody = loadTemplate(templateName);

  // Render the notification-specific body first
  const bodyHtml = renderBody(data);

  // Inject into shared base layout
  const fullHtml = renderBase({
    ...data,
    body: bodyHtml,
    year: new Date().getFullYear(),
  });

  // Generate plain-text fallback by stripping HTML
  const plainText = fullHtml
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { html: fullHtml, text: plainText };
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
