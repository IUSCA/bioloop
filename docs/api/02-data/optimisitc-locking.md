---
title: Optimistic Concurrency Control
---

# Optimistic Concurrency Control
Optimistic concurrency control is a strategy used to manage concurrent access to resources in a database. It allows multiple transactions to proceed without locking resources, assuming that conflicts will be rare. When a conflict does occur, the transaction is rolled back and the user is notified.
This approach is particularly useful in scenarios where conflicts are infrequent, as it can lead to better performance and reduced contention for resources.

## Model Structure
Below is a general structure for a model that uses optimistic concurrency control:

```prisma
model resource {
  id          Int      @id @default(autoincrement())
  name        String
  version     Int      @default(1)
  data        Json
  updated_at  DateTime @updatedAt
  created_at  DateTime @default(now())
}
```

`version` is an integer that is incremented each time the resource is updated. This field is used to detect conflicts.

## Creating a Resource
When creating a new resource, the version is set to 1 by default.

## Updating a Resource
When updating a resource, the version is checked to ensure that it has not changed since it was last read. If the version does not match, an error is thrown. Below is an example:

```javascript
async function updateResource({ id, data }, context = {}) {
  return prisma.resource.update({
    where: { id, version: context.version },
    data: {
      ...data,
      version: context.version + 1,
    },
  }).catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError
        && (e.code === 'P2025' || e.code === 'P2015')) {
      throw new ConflictError(CONFLICT_ERROR_MESSAGE);
    }
    throw e;
  });
}
```

## Handling Conflicts
When a conflict occurs, the application should handle it gracefully. This can involve notifying the user, allowing them to retry the operation, or merging changes. 

Conflict errors are handled globally in the application when not explicitly handled in the code. If a version conflict occurs then HTTP 409 is returned with a message indicating the conflict.

This is how to handle the error in UI:

```javascript
service.updateResource({ id, data })
  .then((response) => {
    // Handle success
  })
  .catch((error) => {
    if (isHTTPError(error, 409)) {
      // Notify user about the conflict
      alert('The resource has been modified by another user. Please refresh and try again.');
    } else {
      // Handle other errors
      throw error;
    }
  });
```