---
title: Audit Logs
---

# Audit Logs

Audit logs are used to track changes made to resources in the system. They provide a historical record of actions performed, including the user who made the change, the type of action, and the data before and after the change. This is essential for maintaining accountability and debugging issues.

## Model Structure

Below is a general structure for an audit log model:

```prisma
model audit_log {
  id            Int      @id @default(autoincrement())
  resource_id   Int?
  action        String
  changed_by_id Int
  timestamp     DateTime @default(now())
  old_data      Json?
  new_data      Json?
  reason        String?
  change_source String // user, admin, system, external

  @@index([resource_id])
}
```

## Creating an Audit Log

When creating a new resource, an audit log entry should be created to record the action. Below is an example:

```javascript
async function createResource({ data }, context = {}) {
  const userId = context.user?.id;
  if (!userId) {
    throw new Error('User context is required for auditing changes');
  }

  return prisma.$transaction(async (tx) => {
    const resource = await tx.resource.create({ data });

    await tx.audit_log.create({
      data: {
        action: 'create',
        resource_id: resource.id,
        changed_by_id: userId,
        new_data: data,
        reason: context.reason,
        change_source: context.source,
      },
    });

    return resource;
  });
}
```

## Updating an Audit Log

When updating a resource, an audit log entry should capture both the old and new data. Below is an example:

```javascript
async function updateResource({ id, updates }, context = {}) {
  const userId = context.user?.id;
  if (!userId) {
    throw new Error('User context is required for auditing changes');
  }

  return prisma.$transaction(async (tx) => {
    const oldResource = await tx.resource.findUnique({ where: { id } });
    if (!oldResource) {
      throw new Error('Resource not found');
    }

    const updatedResource = await tx.resource.update({
      where: { id },
      data: updates,
    });

    await tx.audit_log.create({
      data: {
        action: 'update',
        resource_id: id,
        changed_by_id: userId,
        old_data: oldResource,
        new_data: updatedResource,
        reason: context.reason,
        change_source: context.source,
      },
    });

    return updatedResource;
  });
}
```

## Best Practices

- Always include the `changed_by_id` field to track the user making the change.
- Use `old_data` and `new_data` fields to capture the state of the resource before and after the change.
- Include a `reason` field to document why the change was made.
- Use `change_source` to specify whether the change was made by a user, admin, system, or an external source.

## Generic Audit Log Example

Below is a generic example of handling audit logs for complex operations:

```javascript
class AuditLogHandler {
  constructor({ resourceId, updates, context }) {
    this.resourceId = resourceId;
    this.updates = updates;
    this.context = context || {};
    this.userId = this.context.user?.id;
    this.changeSource = this.context.source;
    this.oldData = null;
  }

  validate() {
    if (!this.userId) {
      throw new Error('User context is required for auditing changes');
    }
    if (!this.changeSource) {
      throw new Error('Change source is required for auditing changes');
    }
  }

  async loadCurrentState(tx) {
    this.oldData = await tx.resource.findUnique({ where: { id: this.resourceId } });
  }

  sanitizeUpdates() {
    // Remove any fields from updates that should not be modified
    for (const key in this.updates) {
      if (this.updates[key] === this.oldData[key]) {
        delete this.updates[key];
      }
    }
  }

  nothingChanged() {
    // Check if there are no meaningful changes in the updates
    return Object.keys(this.updates).length === 0;
  }

  async persist(tx) {
    const updatedResource = await tx.resource.update({
      where: { id: this.resourceId },
      data: this.updates,
    });

    await tx.audit_log.create({
      data: {
        action: 'update',
        resource_id: this.resourceId,
        changed_by_id: this.userId,
        old_data: this.oldData,
        new_data: updatedResource,
        reason: this.context.reason,
        change_source: this.changeSource,
      },
    });

    return updatedResource;
  }

  async execute() {
    this.validate();

    await this.loadCurrentState();

    this.sanitizeUpdates();

    if (this.nothingChanged()) {
      return this.request;
    }

    return prisma.$transaction((tx) => this.persist(tx));
  }
}
```

By following these guidelines and examples, audit logs can provide a comprehensive and reliable record of changes made to resources in the system.


### Get resource with audit logs

```javascript
async function getResourceWithAuditLogs(id) {
  const resource = await prisma.resource.findUnique({
    where: { id },
    include: {
      audit_logs: {
        orderBy: { timestamp: 'desc' },
        include: {
          changed_by: true,
        },
      },
    },
  });

  return resource;
}
```


## UI

```html
<VaCard>
  <VaCardTitle>
    <span class="text-lg"> Audit Logs </span>
  </VaCardTitle>
  <VaCardContent>
    <AuditLogs
      :logs="
        request?.audit_logs?.map((l) => ({
          ...l,
          user: l.changed_by,
          summary: getAuditLogSummary(l),
          comments:
            (l.stage ? `Stage: ${l.stage.name}\n\n` : '') +
            (l.reason || ''),
        }))
      "
      class="max-h-[calc(100vh-130px)] min-h-96 overflow-y-auto"
    />
  </VaCardContent>
</VaCard>
```