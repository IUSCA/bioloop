## User Collections

```prisma
model collection {
  id          Int                @id @default(autoincrement())
  name        String
  criteria    Json?              // Optional dynamic query definition (e.g., tag-based)
  is_dynamic  Boolean            @default(false)
  target_type CollectionTargetType

  // audit fields
}

model user_collection {
  user_id Int
  collection_id Int
  user          user        @relation(fields: [user_id], references: [id], onDelete: Cascade)
  collection    collection  @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  @@id([user_id, collection_id])
}

model dataset_collection {
  dataset_id Int
  collection_id Int
  dataset       dataset            @relation(fields: [dataset_id], references: [id], onDelete: Cascade)
  collection    dataset_collection @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  @@id([dataset_id, collection_id])
}

enum CollectionTargetType {
  user
  dataset
  // add more types as needed
}
```

### Recompute Triggers

| Event                            | Should trigger recompute? | Reason                                      |
| -------------------------------- | ------------------------- | ------------------------------------------- |
| Collection is created (with criteria) | ✅                         | Evaluate all users                          |
| Collection criteria is updated        | ✅                         | Evaluate all users                          |
| Collection is deleted                 | ❌                         | Cascade delete from `user_collection`       |
| **User is created**              | ✅                         | recompute only the **affected user**        |
| **User is updated**              | ✅                         | recompute only the **affected user**        |
| User is deleted                  | ❌                         | Cascade delete from `user_collection`       |


#### Implementation Strategy

* Create a function `recomputeUserCollectionMembership(userId)` that:

  * Fetches all dynamic collections
  * Applies each collection's criteria to the user
  * Updates the `user_collection` table accordingly (insert/delete as needed)
* Call it:

  * After `user.update()`
  * After `user.create()`

* **Use a DB transaction** for user creation/update only.
* **After commit**, trigger `recomputeUserCollectionMembership(userId)`:

  * In a background worker (e.g., BullMQ, temporal, SQS)
  * Or inline if recompute is guaranteed to be fast and low-risk

* Optionally, expose an admin-only endpoint like `POST /user-collections/:id/recompute`.

This gives the **correctness of isolation**, while avoiding performance penalties or complex error handling in your main transactional code path.