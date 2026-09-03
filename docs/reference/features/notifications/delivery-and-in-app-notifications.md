# Notification Delivery and In-App Notifications

This document describes the current delivery pipeline, in-app persistence, SSE delivery, API routes, permissions, and Vue UI. The implementation under `api/src/notification`, `api/src/routes/notifications.js`, `ui/src/services/notification.js`, `ui/src/stores/notification.js`, and `ui/src/components/notifications` is the source of truth.

## High-Level Flow

```text
Application code
  -> NotificationService.send*()
      -> Bull queue in Redis
      -> optional in-app row when userId is supplied
          -> Prisma notification table
          -> Redis pub/sub channel sse:notify:<userId>
          -> API worker holding that user's SSE connection
          -> browser Pinia notification store

notification-worker
  -> consumes Bull queues
  -> renders MJML/Handlebars email
  -> sends through Nodemailer SMTP
```

Email delivery and in-app notifications share the `NotificationService` entry point, but they are otherwise separate systems. Email is a queued worker pipeline. In-app notification is a database row plus realtime push.

## Server Files

```text
api/src/notification/
  NotificationService.js              # public send* API and optional dual-write
  notificationBus.js                  # optional event bus adapter
  types.js                            # notification type constants and queue routing
  queue/queues.js                     # Bull queue factory
  worker.js                           # single email worker process
  cron.js                             # scheduled jobs, run only by the worker
  inApp/
    InAppNotificationService.js       # DB operations and SSE trigger
    sseManager.js                     # SSE registry and Redis pub/sub

api/src/routes/notifications.js       # REST and SSE endpoints
api/prisma/schema.prisma              # notification model
api/ecosystem.config.js               # api cluster plus notification-worker fork
```

## Notification Types and Queues

`api/src/notification/types.js` defines the current type set:

| Type | Queue | Bull priority |
| --- | --- | --- |
| `alert` | `email:high` | `1` |
| `system` | `email:high` | `1` |
| `workflow` | `email:normal` | `3` |
| `request` | `email:normal` | `3` |
| `digest` | `email:low` | `10` |

`NotificationService._enqueue()` validates the type, normalizes `to` into a lower-case recipient array, and enqueues a Bull job with retries. Default queue options are three attempts with exponential backoff, keeping the last 50 completed jobs and last 200 failed jobs.

## Public Send API

Application code should import only `NotificationService`:

```js
const notify = require('@/notification/NotificationService');

await notify.sendSystem({
  to: ['user@example.edu'],
  subject: 'Scheduled maintenance',
  message: 'Bioloop will be unavailable during the maintenance window.',
  actionUrl: 'https://bioloop.example.edu/status',
  userId: user.id,
});
```

All `send*` methods return the Bull job after enqueueing. They do not wait for email delivery.

Passing `userId` enables the current dual-write behavior: after the email job is queued, `NotificationService` asynchronously calls `InAppNotificationService.create({ userId, type, title: subject, payload: data })`. Failures creating the in-app row are logged and do not fail the email enqueue path.

`sendDigest()` currently enqueues email only because it does not accept `userId`.

## Event Bus

`api/src/notification/notificationBus.js` is an optional in-process adapter for domain events. `api/src/index.js` calls `registerHandlers()` on startup. Handlers translate events such as `workflow.approved` or `request.received` into `NotificationService.send*()` calls.

The bus is not cross-process. In PM2 cluster mode each API process has its own emitter, which is acceptable because the process handling the request also enqueues the Bull job. Redis/Bull handle cross-process job delivery.

Current event constants:

| Constant | Event name |
| --- | --- |
| `ALERT_TRIGGERED` | `alert.triggered` |
| `WORKFLOW_APPROVED` | `workflow.approved` |
| `WORKFLOW_REJECTED` | `workflow.rejected` |
| `WORKFLOW_UPDATED` | `workflow.updated` |
| `REQUEST_RECEIVED` | `request.received` |
| `REQUEST_COMPLETED` | `request.completed` |
| `SYSTEM_BROADCAST` | `system.broadcast` |

## Worker and Runtime Dependencies

`api/ecosystem.config.js` runs two PM2 apps:

| App | Mode | Instances | Purpose |
| --- | --- | --- | --- |
| `api` | `cluster` | `2` | Express API and SSE endpoints. |
| `notification-worker` | `fork` | `1` | Bull processors and cron jobs. |

The worker must stay single-instance because `cron.js` is loaded there. Running multiple workers would duplicate scheduled sends.

Runtime dependencies:

| Dependency | Used for |
| --- | --- |
| Redis | Bull queues and SSE pub/sub. Docker Compose provides `redis:7-alpine` on port `6379`. |
| SMTP | Nodemailer delivery. Local Docker Compose provides MailHog SMTP on `1025` and UI on `8025`. |
| Postgres | Persistent in-app notifications through Prisma. |

Useful API scripts from `api/package.json`:

```bash
npm run dev          # API only
npm run dev:worker   # notification worker only
npm run dev:all      # API and worker together
npm run worker       # worker without nodemon
```

## In-App Data Model

Current Prisma model:

```prisma
model notification {
  id         String   @id @default(uuid())
  user_id    Int
  type       String
  title      String
  body       String?
  payload    Json
  is_read    Boolean  @default(false)
  created_at DateTime @default(now()) @db.Timestamp(6)

  user user @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, is_read])
  @@index([user_id, created_at])
}
```

`InAppNotificationService.create()` omits undefined payload fields, writes the row, then publishes the created row through `sseManager.push(userId, notification)`.

The normal row shape returned to the UI is:

```json
{
  "id": "uuid",
  "user_id": 123,
  "type": "system",
  "title": "Scheduled maintenance",
  "body": null,
  "payload": {
    "message": "Bioloop will be unavailable.",
    "actionUrl": "https://bioloop.example.edu/status",
    "actionLabel": "Check status"
  },
  "is_read": false,
  "created_at": "2026-06-20T12:00:00.000Z"
}
```

## SSE Delivery

Clients open `GET /notifications/stream`. The route sets `text/event-stream`, disables buffering with `X-Accel-Buffering: no`, flushes headers, and registers the Express response with `sseManager`.

Each API process keeps:

```text
Map<userId, Set<Response>>
```

When a row is created, `sseManager.push()` publishes the row JSON to Redis channel `sse:notify:<userId>`. Every API process pattern-subscribes to `sse:notify:*`; only the process holding a connection for that user writes:

```text
event: notification
data: <notification row JSON>
```

The initial connection receives:

```text
event: ping
data: {}
```

The browser `EventSource` handles reconnection automatically.

## HTTP API

All routes are mounted under `/notifications` by `api/src/routes/index.js` and require the normal authenticated user context.

| Method | Path | Permission | Response |
| --- | --- | --- | --- |
| `GET` | `/notifications/stream` | `notifications:read` | SSE stream. |
| `GET` | `/notifications?page=1&limit=20` | `notifications:read` | `{ data, metadata: { total, page, limit } }`. |
| `GET` | `/notifications/unread-count` | `notifications:read` | `{ count }`. |
| `PATCH` | `/notifications/read-all` | `notifications:update` | `{ success: true }`. |
| `PATCH` | `/notifications/:id/read` | `notifications:update` | `{ success: true }` or `404`. |
| `DELETE` | `/notifications/:id` | `notifications:delete` | `{ success: true }` or `404`. |

Pagination limits are validated as integers with `page >= 1` and `1 <= limit <= 100`. All read/update/delete operations are scoped to `req.user.id`; users cannot fetch, mark, or delete another user's rows.

Current role permissions:

| Role | Read | Mark read | Delete |
| --- | --- | --- | --- |
| `user` | yes | yes | no |
| `operator` | yes | yes | yes |
| `admin` | yes | yes | yes |

## Vue UI

Frontend files:

```text
ui/src/services/notification.js
ui/src/stores/notification.js
ui/src/components/notifications/
  NotificationDropdown.vue
  NotificationItem.vue
  types/
    AlertNotification.vue
    WorkflowNotification.vue
    RequestNotification.vue
    SystemNotification.vue
    FallbackNotification.vue
ui/src/pages/notifications.vue
ui/src/App.vue
ui/src/components/layout/Header.vue
```

`ui/src/App.vue` watches `auth.loggedIn`. When the user is logged in and `auth.isFeatureEnabled("notifications")` is true, it calls `notificationStore.connect()`. Otherwise it disconnects the SSE stream.

The Pinia store keeps:

| State | Meaning |
| --- | --- |
| `notifications` | Current page/list shown by dropdown or page. |
| `unreadCount` | Unread badge count. |
| `totalCount` | Total rows from the paginated API response. |
| `page`, `limit` | Current pagination state. |
| `loading` | List loading state. |
| `sseConnection` | Active `EventSource`, if connected. |

On each `notification` SSE event the store parses the row, prepends it to `notifications`, and increments `unreadCount`.

The header dropdown is mounted in `Header.vue` when the feature is enabled. It fetches unread count and the first 8 rows on mount, shows the unread badge, supports "Mark all read", and links to `/notifications`.

The full `/notifications` page fetches page 1 with 20 rows on mount, fetches unread count, filters the current client-side page by `all`, `unread`, `alert`, `workflow`, `request`, or `system`, and uses the shared `Pagination` component for page/limit changes.

`NotificationItem` chooses a type component by `notification.type`. Unknown types render through `FallbackNotification`.

## Payload Compatibility Notes

The in-app payload is currently the same `data` object used by the email template. The Vue components do not read every email field, and a few field names are not aligned:

| Type | `NotificationService` payload | Current Vue component reads |
| --- | --- | --- |
| `alert` | `alertTitle`, `alertBody`, `severity`, `actionUrl`, `actionLabel` | `alertTitle`, `severity`, `message`, `actionUrl`, `actionLabel` |
| `workflow` | `workflowName`, `stepName`, `status`, `message`, `actionUrl`, `actionLabel` | `workflowName`, `status`, `step`, `actionUrl`, `actionLabel` |
| `request` | `requestType`, `requestTitle`, `requesterName`, `message`, `dueDate`, `actionUrl`, `actionLabel` | `requestTitle`, `requesterName`, `dueDate`, `actionUrl`, `actionLabel` |
| `system` | `message`, `actionUrl`, `actionLabel` | `message`, `actionUrl`, `actionLabel` |

For notifications created directly with `InAppNotificationService.create()`, use the fields the Vue component expects. For dual-written notifications created through `NotificationService`, alert body and workflow step display are currently limited unless the payload or Vue components are normalized.

## Adding a Notification Type

1. Add the type constant and queue routing in `api/src/notification/types.js`.
2. Add a public send method in `api/src/notification/NotificationService.js`.
3. Add a template and fixture as described in `templating-and-preview.md`.
4. If needed, add an event bus constant and handler in `notificationBus.js`.
5. Add a Vue type component under `ui/src/components/notifications/types/`.
6. Register it in `TYPE_COMPONENTS` and `TYPE_ICONS` in `NotificationItem.vue`.
7. Add a filter chip in `ui/src/pages/notifications.vue` if users should filter by the new type.
8. If the type should be in-app, make sure the payload field names match what the Vue component reads.
