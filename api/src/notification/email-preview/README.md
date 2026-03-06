# Email Template Live Preview

A Vite-powered dev server that renders every MJML + Handlebars email template in the browser with **instant hot-module-replacement** (HMR) whenever a template or its fixture data changes.

---

## Quick start

```bash
# From the api/ directory
npm run email:dev
```

Vite starts on **http://localhost:5179** (auto-increments if the port is busy) and opens the preview UI automatically.

---

## File layout

```
src/notification/
├── templates/              ← the real templates (edit these during development)
│   ├── base.mjml.hbs       ← shared header / footer / styles layout
│   ├── alert.mjml.hbs
│   ├── workflow.mjml.hbs
│   ├── request.mjml.hbs
│   ├── digest.mjml.hbs
│   └── system.mjml.hbs
│
└── email-preview/          ← preview tooling (not shipped to production)
    ├── vite.config.js      ← Vite config + custom plugin
    ├── index.html          ← browser UI
    └── fixtures/           ← sample data injected into each template
        ├── alert.json
        ├── workflow.json
        ├── request.json
        ├── digest.json
        └── system.json
```

---

## Using the UI

| Element | Description |
|---|---|
| **Sidebar** | Lists all available templates. Click one to render it. |
| **Top bar – template name** | Shows the active template and a "Compiled HH:MM:SS" timestamp. Turns red on a compile error. |
| **Desktop / Mobile toggle** | Switches the preview iframe between full-width (≤ 680 px) and mobile-width (390 px). |
| **⚡ HMR active** | Confirms the WebSocket connection to the Vite dev server is alive. |
| **iframe** | Renders the compiled email HTML in an isolated document, exactly as an email client would. |

When a template or fixture file is saved, the active template re-renders automatically. No manual refresh needed.

---

## Fixture files

Each template has a corresponding JSON file in `fixtures/` that supplies the Handlebars variables used during the preview compile. The fixture data is **never** used in production — it is only consumed by the dev server.

### Structure

A fixture must supply every variable that the template and `base.mjml.hbs` reference. At minimum it needs the base-layout fields:

```json
{
  "subject":  "Email subject line",
  "preview":  "Short preview text shown by email clients",
  "_meta": {
    "type":        "Alert",
    "generatedAt": "2026-03-06T14:22:00Z"
  }
}
```

Then add whichever fields the body template uses. Example for `alert`:

```json
{
  "subject":    "Critical: Storage quota exceeded",
  "preview":    "Your storage quota has been exceeded.",
  "severity":   "critical",
  "alertTitle": "Storage Quota Exceeded",
  "alertBody":  "The primary data volume has reached 98% capacity.",
  "actionUrl":  "https://bioloop.example.edu/datasets",
  "actionLabel":"Manage Storage",
  "_meta": { "type": "Alert", "generatedAt": "2026-03-06T14:22:00Z" }
}
```

### Handlebars helpers available in fixtures / templates

| Helper | Signature | Output |
|---|---|---|
| `formatDate` | `{{formatDate someIsoString}}` | Locale date string, e.g. `6 Mar 2026, 09:22` |
| `ifEq` | `{{#ifEq a "b"}}…{{else}}…{{/ifEq}}` | Renders first block when `a === b` |

Both helpers mirror the definitions in `templateRenderer.js` so the preview output matches production exactly.

---

## Adding a new template

1. **Create the template file** inside `src/notification/templates/`:

   ```
   src/notification/templates/my-new-type.mjml.hbs
   ```

   The file contains raw MJML Handlebars markup (no `<mjml>` wrapper — that comes from `base.mjml.hbs`). Look at `alert.mjml.hbs` for a minimal example.

2. **Register the name** in `vite.config.js`:

   ```js
   const TEMPLATE_NAMES = ['alert', 'workflow', 'request', 'digest', 'system', 'my-new-type'];
   ```

3. **Create a fixture file**:

   ```
   src/notification/email-preview/fixtures/my-new-type.json
   ```

4. **Register the name** in `templateRenderer.js` so it is preloaded at worker startup:

   ```js
   const names = ['base', 'alert', 'workflow', 'request', 'digest', 'system', 'my-new-type'];
   ```

The new template now appears in the sidebar automatically when the dev server restarts (or is already running).

---

## How it works

```
Browser                     Vite dev server (Node)
  │                               │
  │── GET /api/templates ─────────▶ middleware lists TEMPLATE_NAMES whose
  │                               │  .mjml.hbs file exists on disk
  │◀─ ["alert","workflow",…] ─────│
  │                               │
  │── GET /preview/alert ─────────▶ compileTemplate("alert"):
  │                               │  1. Read fixtures/alert.json
  │                               │  2. Read base.mjml.hbs + alert.mjml.hbs
  │                               │  3. Handlebars.compile(body)(data) → bodyMjml
  │                               │  4. Handlebars.compile(base)({…, body}) → fullMjml
  │                               │  5. mjml2html(fullMjml) → { html, errors }
  │◀─ 200 text/html ──────────────│
  │  (written into iframe)        │
  │                               │
  │  [user edits alert.mjml.hbs]  │
  │                               │  fs.watch fires
  │                               │  server.ws.send({
  │                               │    type: 'custom',
  │◀─ HMR event "email-update" ───│    event: 'email-update',
  │   { name: "alert" }           │    data: { name: "alert" }
  │                               │  })
  │  import.meta.hot.on(          │
  │    'email-update', …)         │
  │  → re-fetch /preview/alert    │
  │  → rewrite iframe             │
```

### Key design decisions

- **No full-page reload** — the `email-update` HMR event contains which template changed, so only the active template's iframe is refreshed.
- **`base.mjml.hbs` invalidates all** — a change to the shared layout sends `email-update` for every template name, so whichever one is active re-renders.
- **No build step** — templates are compiled on-demand per request directly from disk, so each hot reload always reflects the newest file contents.
- **Isolated iframe document** — the email HTML is written into a sandboxed `<iframe>` via `document.write`, replicating the isolated rendering environment of an email client and preventing preview styles from leaking into the shell UI.
- **Compile errors surface in the iframe** — if MJML or Handlebars throws, the error with full stack trace is rendered as a red `<pre>` block inside the iframe rather than crashing the server.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port already in use | Vite auto-increments. Check the terminal for the actual URL. Set `server.port` in `vite.config.js` to pin one. |
| Template not in sidebar | Check that the name is listed in `TEMPLATE_NAMES` in `vite.config.js` and the `.mjml.hbs` file exists. |
| Variables rendering as empty strings | The fixture JSON key does not match the Handlebars `{{variable}}` name. Both are case-sensitive. |
| `Fixture not found` error in iframe | Create `fixtures/<name>.json` with at least `subject`, `preview`, and `_meta`. |
| Changes not triggering HMR | The watcher only covers files inside `templates/` and `fixtures/`. Check the file path and extension. |
