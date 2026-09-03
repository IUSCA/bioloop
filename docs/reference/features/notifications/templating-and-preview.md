# Notification Templating and Preview

This document describes the current email template implementation and its local preview harness. The source of truth is the code under `api/src/notification/`.

## Files

```text
api/src/notification/
  email/
    templateRenderer.js       # production renderer
    mailer.js                 # Nodemailer SMTP transport
  templates/
    base.mjml.hbs             # shared MJML shell
    alert.mjml.hbs
    workflow.mjml.hbs
    request.mjml.hbs
    digest.mjml.hbs
    system.mjml.hbs
  email-preview/
    vite.config.js            # preview dev server and middleware
    index.html                # browser preview UI
    fixtures/*.json           # named sample data for each template
```

Templates are MJML files with Handlebars expressions. The notification-specific template renders an MJML fragment first; `base.mjml.hbs` wraps it with the shared header, footer, styles, and email metadata. The final MJML is compiled to HTML and converted to plain text for multipart email.

## Production Renderer

`api/src/notification/email/templateRenderer.js` exposes:

| Function | Purpose |
| --- | --- |
| `renderTemplate(templateName, data)` | Renders `templates/<templateName>.mjml.hbs` inside `base.mjml.hbs`, compiles MJML to HTML, and generates plain text. |
| `preloadTemplates()` | Compiles the known template set at worker startup to avoid first-job template latency. |

The renderer caches compiled Handlebars functions in memory. It registers the same helpers used by the preview harness:

| Helper | Usage |
| --- | --- |
| `formatDate` | <code v-pre>{{formatDate dueDate}}</code> renders a locale date/time string. |
| `ifEq` | <code v-pre>{{#ifEq severity "critical"}}...{{else}}...{{/ifEq}}</code>. |

Current preload list:

```js
['base', 'alert', 'workflow', 'request', 'digest', 'system']
```

When adding a template, update this list if the worker should preload it.

## Template Data

Email jobs are created through `NotificationService`. Each public `send*` method chooses a template and builds the data object consumed by that template.

| Method | Template | Data fields |
| --- | --- | --- |
| `sendAlert` | `alert` | `alertTitle`, `alertBody`, `severity`, `actionUrl`, `actionLabel` |
| `sendWorkflowUpdate` | `workflow` | `workflowName`, `stepName`, `status`, `message`, `actionUrl`, `actionLabel` |
| `sendRequest` | `request` | `requestType`, `requestTitle`, `requesterName`, `message`, `dueDate`, `actionUrl`, `actionLabel` |
| `sendDigest` | `digest` | `period`, `items[]` where each item has `title`, `body`, optional `url` |
| `sendSystem` | `system` | `message`, `actionUrl`, `actionLabel` |

The worker also injects:

```js
_meta: {
  type,
  generatedAt: new Date().toISOString(),
}
```

`base.mjml.hbs` currently references `subject` and `preview`, but `worker.js` passes only the method data plus `_meta` into `renderTemplate()`. The Nodemailer message still receives `subject`; it is just not part of the Handlebars context unless the caller also includes it in `data` or the worker is updated.

## SMTP Sending

`api/src/notification/email/mailer.js` creates a pooled Nodemailer SMTP transport from `config`:

| Config key | Meaning |
| --- | --- |
| `smtp.host` | SMTP host. Defaults to `localhost` in `api/config/default.json`. |
| `smtp.port` | SMTP port. Defaults to `1025`, matching MailHog in `docker-compose.yml`. |
| `smtp.secure` | TLS mode. |
| `smtp.from.name` | Sender display name. |
| `smtp.from.address` | Sender email address. |

The current transport has auth fields commented out because the intended production path is a trusted SMTP relay. `verifyConnection()` runs at worker startup and logs a warning if SMTP is unavailable; queued jobs can still retry when SMTP returns.

## Preview Harness

Run from the `api/` directory:

```bash
npm run email:dev
```

This starts Vite with `api/src/notification/email-preview/vite.config.js`, normally on `http://localhost:5179` unless the port is taken. The dev server provides:

| Route | Purpose |
| --- | --- |
| `GET /api/templates` | Lists `templates/*.mjml.hbs`, excluding `base.mjml.hbs`. |
| `GET /api/fixtures/:name` | Lists named fixtures from `email-preview/fixtures/<name>.json`. |
| `GET /preview/:name?fixture=<fixture>` | Compiles one template with one fixture and returns rendered HTML. |

The preview UI lists templates, lets you select a named fixture, toggles desktop/mobile iframe width, and refreshes only the active iframe on changes. Template and fixture changes send a custom Vite HMR event named `email-update`. Changes to `base.mjml.hbs` invalidate every template.

Fixture files can be either a plain object or a named fixture map. Prefer a named map:

```json
{
  "default": {
    "subject": "Workflow Update: Genome Sequencing Pipeline",
    "preview": "Your workflow has progressed to a new step.",
    "workflowName": "Genome Sequencing Pipeline",
    "stepName": "Quality Control",
    "status": "completed",
    "message": "The Quality Control step has completed successfully.",
    "actionUrl": "https://bioloop.example.edu/workflows/genome-seq-42",
    "actionLabel": "View Workflow",
    "_meta": {
      "type": "Workflow",
      "generatedAt": "2026-03-06T09:15:00Z"
    }
  }
}
```

Fixtures are development-only. They are not used by the notification worker.

## Adding or Changing a Template

1. Add or edit `api/src/notification/templates/<name>.mjml.hbs`.
2. Add or update `api/src/notification/email-preview/fixtures/<name>.json`.
3. If this is a new production template, add it to `preloadTemplates()` in `templateRenderer.js`.
4. Add or update a `NotificationService` method so callers enqueue the template with the expected data shape.
5. If the same type should also appear in-app, update the Vue type component mapping described in `delivery-and-in-app-notifications.md`.

Keep template markup email-safe: use MJML components, inline-friendly styles, simple table-compatible layout, absolute URLs, and small data shapes. The preview harness catches MJML/Handlebars errors in the iframe, but it is not a substitute for testing a real sent email through MailHog or the production relay.
