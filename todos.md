- document user leaving page before upload finishes ; import history page

- documet these fixes

- api slow?

- stop persisting values to the `process_id` column. It servers no purpose. Scan for all its usages and remove them from the codebase. Keep the col in the db so we don't have to do another migration.
also, don't accopunt for backward cmpatibility.

- diagrams update?

- notifications not being created?