# Notification Service — Integration Guide

## What you're adding

```
your-project/
  src/
    notification/              ← drop this entire folder in as-is
      config.js
      types.js
      NotificationService.js
      notificationBus.js
      worker.js
      cron.js
      queue/
        queues.js
      email/
        mailer.js
        templateRenderer.js
      templates/
        base.hbs
        alert.hbs
        workflow.hbs
        request.hbs
        digest.hbs
        system.hbs
      utils/
        logger.js
  ecosystem.config.js          ← add worker entry
  docker-compose.yml           ← add redis service + env vars
  .env                         ← add new vars from .env.example
```

---

## Step 1 — Install dependencies

```bash
npm install bull ioredis nodemailer handlebars node-cron winston
```

---

## Step 2 — Copy environment variables

Copy the new vars from `.env.example` into your existing `.env`:

```
REDIS_HOST=redis
REDIS_PORT=6379
SMTP_HOST=host.docker.internal
SMTP_PORT=25
SMTP_FROM_NAME=University System
SMTP_FROM_ADDRESS=noreply@university.edu
NOTIFY_WORKER_CONCURRENCY=5
```

---

## Step 3 — Update docker-compose.yml

Apply the additions from `docker-compose.additions.yml`:
- Add the `redis` service
- Add `extra_hosts`, `depends_on`, and env vars to your app service

```bash
docker compose up -d redis         # start Redis
docker compose up -d --build       # rebuild and restart your app
```

---

## Step 4 — Configure Postfix on the host
<!-- cSpell: ignore mynetworks -->
Allow the Docker network to relay through Postfix:

```bash
# /etc/postfix/main.cf
mynetworks = 127.0.0.0/8 172.16.0.0/12 [::1]/128

sudo postfix reload

# Verify connectivity from inside the container:
docker exec -it <your_container> nc -zv host.docker.internal 25
```

---

## Step 5 — Register event handlers in your existing app startup

Add ONE line to your existing `app.js` or `server.js`:

```js
// At the top of your existing app.js / server.js:
const { registerHandlers } = require('./notification/notificationBus');

// Call once before app.listen():
registerHandlers();
```

Also add queue cleanup to your graceful shutdown:

```js
const { closeAllQueues } = require('./notification/queue/queues');

// In your SIGTERM handler:
process.on('SIGTERM', async () => {
  await closeAllQueues();  // drain in-flight enqueue operations
  server.close(() => process.exit(0));
});
```

---

## Step 6 — Update ecosystem.config.js

Add the worker entry from `ecosystem.config.js` to your existing file.
Then reload PM2:

```bash
pm2 reload ecosystem.config.js --env production
pm2 list
# You should see both 'api' (cluster) and 'notification-worker' (fork/online)
```

---

## Optional — Use your existing logger

If you have a Winston/Pino logger, replace the contents of
`src/notification/utils/logger.js` with:

```js
'use strict';
module.exports = require('../path/to/your/existing/logger');
```

The notification module only calls `.info()`, `.warn()`, `.error()`, `.debug()`.

---

## Usage examples

### Direct function call (after a DB operation)

```js
const notify = require('./notification/NotificationService');

async function approveLeaveRequest(req, res) {
  const request = await db.leaveRequests.update(
    { status: 'approved' },
    { where: { id: req.params.id }, returning: true }
  );
  const user = await db.users.findByPk(request.userId);

  // Enqueues instantly, does not block the response
  notify.sendWorkflowUpdate({
    to:           [user.email],
    subject:      'Your leave request has been approved',
    workflowName: 'Leave Approval',
    stepName:     'Manager Review',
    status:       'approved',
    message:      `Your leave for ${request.startDate}–${request.endDate} has been approved.`,
    actionUrl:    `https://portal.uni.edu/leave/${request.id}`,
  }).catch(err => console.error('Failed to enqueue notification', err));

  res.json({ success: true });
}
```

### Event bus (decoupled from business logic)

```js
const { notificationBus, EVENTS } = require('./notification/notificationBus');

// After saving an access request to the DB:
notificationBus.emit(EVENTS.REQUEST_RECEIVED, {
  to:            ['supervisor@university.edu'],
  requestType:   'access',
  requestTitle:  'VPN Access — Jane Doe',
  requesterName: 'Jane Doe',
  message:       'Jane requires VPN access for remote research work.',
  dueDate:       '2024-02-01',
  actionUrl:     'https://portal.uni.edu/requests/456',
});
```

### Multiple recipients

```js
// to: accepts a string or an array
notify.sendSystem({
  to:      ['admin@uni.edu', 'ops@uni.edu'],
  subject: 'Scheduled maintenance this Sunday',
  message: 'The portal will be offline 23:00–01:00 GMT on Sunday 28 Jan.',
});
```

### Cron digest

Edit `src/notification/cron.js` and replace `fetchDailyDigestRecipients()`
with your actual DB query. The schedule and send logic is already wired.

---

## Verifying it works

```bash
# Watch worker logs live
pm2 logs notification-worker

# Send a test notification from Node REPL or a test script:
node -e "
  require('dotenv').config();
  const notify = require('./src/notification/NotificationService');
  notify.sendSystem({
    to: ['your-email@university.edu'],
    subject: 'Notification worker online',
    message: 'The notification worker is running correctly.',
  }).then(job => console.log('Enqueued job:', job.id));
"
```
