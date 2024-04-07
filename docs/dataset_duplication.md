Bioloop allows for duplicate datasets to be registered in the system.

---

## Registration

Duplicate datasets are registered by the `watch.py` script, if it finds a dataset present in the `source_dir` directory which has the same name and type as an existing active dataset.

The duplicate dataset is registered at the database level, and action items and notifications are created in the system, to allow operators/admins a chance to review the duplicate dataset.

Upon registration, the `watch` script launches the `handle_duplicate_datasets` workflow that runs the `await_stability`, `inspect_dataset` and `compare_duplicate_datasets` steps on the duplicate dataset.
- The `compare_duplicae_datasets` step compares the newly created duplicate dataset with the original dataset, and generates a comparison report which is persisted to Postgres.

The results of the comparison analysis are shown to operators/admins in the UI, based on which they can either accept or reject a duplicate dataset.

### Versioning


- The system is designed to handle multiple co-existing duplicates of the same dataset. However, for simplicity, this feature is disabled at the moment, and only one duplicate is allowed to exist in the system.
  - If enabled, multiple concurrent duplicates of a dataset will only be registered at the database level, not at the filesystem level.
- If multiple duplicates of the same dataset are allowed to co-exist in the system, they will be assigned versions to differentiate between them.
- Overwritten datasets are also assigned versions, in case a dataset is overwritten more than once.

### Action Items

For each duplicate dataset registered by the system, an action item is created in the Postgres table `dataset_action_item`, and a notification is persisted to the `notification` table.

Each action item is linked to multiple `dataset_ingestion_check` records, and each `dataset_ingestion_check` record represents the results of comparing a duplicate dataset with the original dataset based on a specific criteria.

A dataset is compared with another based on 3 criteria:
1. There are no files in either dataset that have the same name and path as a file in the other dataset, but a different MD5 checksum. 
2. Original dataset has files that the duplicate dataset doesn't.
3. Duplicate dataset has files that the original dataset doesn't.

---

## Actions
Operators and Admins have the access to accept or reject an incoming duplicate dataset.


### Acceptance
When an operator/admin decides to accept a duplicate dataset into the system, the following steps take place:
1. State updates are made for both the original and duplicate datasets, which act as locks on the dataset.
   * The following state updates are made:
     * The Duplicate dataset's state is moved to `DUPLICATE_ACCEPTANCE_IN_PROGRESS`
     * Te original dataset's state is moved to `OVERWRITE_IN_PROGRESS`.
   * These state locks ensure that any writes made on either dataset (or its state) via the API layer will fail while the state locks are in place. The workers processing a dataset also check for state locks, and won't proceed if a dataset is locked.
2. The action item and notification corresponding to the duplicate dataset are acknowledged.
3. An audit log is created for the incoming duplicate dataset's acceptance, and another one for the original dataset's overwrite.
4. Any other duplicates that may have been created for the original dataset are rejected, and their action items and notifications are resolved. 
5. The API layer launches the `accept_duplicate_dataset` workflow on the duplicate dataset, which:
   * runs the `purge_original_dataset_resources` step, which:
     * deletes the filesystem resources associated with the original dataset (its `staged_path` and `bundle.path`) from the filesystem
     * moves the state of the original dataset is moved to `ORIGINAL_DATASET_RESOURCES_PURGED`.
   * runs the `accept` step, which:
     * replaces the original dataset with the duplicate dataset by transferring all database relations of the original dataset to the duplicate dataset.
     * removes the original dataset from the system by marking it as deleted in the database (by setting its `is_deleted` to `true`. The dataset record continues to exist in the `dataset` table, for auditing purposes).
     * marks the action item and notification created for the duplication as resolved and inactive.
     * makes the following state updates:
       * moves the duplicate dataset's state to `DUPLICATE_ACCEPTED`
       * moves the original dataset's state to `OVERWRITTEN`
     * the state locks are considered released at this point, and the datasets can be written to.
   * runs the `archive_dataset`, `stage_dataset`, `validate_dataset` and `setup_dataset_download` steps, thereby making the newly-ingested dataset available for download.


### Rejection
When an operator/admin decides to reject a duplicate dataset from the syste, the following steps take place:
1. State updates are made on the duplicate dataset:
   * The duplicate dataset's state is moved to `DUPLICATE_REJECTION_IN_PROGRESS`.
   * This state lock ensures that any writes made on the duplicate dataset (or its state) via the API layer will fail while the state lock is in place.
2. The action item and notification corresponding to the duplicate dataset are acknowledged.
3. An audit log is created for the incoming duplicate dataset's rejection.
4. The API layer launches the `reject_duplicate_dataset` workflow on the duplicate dataset, which:
   * runs the `purge_duplicate_dataset_resources` workflow on the duplicate dataset, which:
     * deletes the filesystem resources associated with the duplicate dataset (its `origin_path`) from the filesystem.
     * moves the state of the duplicate dataset to `DUPLICATE_DATASET_RESOURCES_PURGED`.
   * runs the `reject` step, which marks the duplicate dataset as deleted in the database (by setting its `is_deleted` to `true`.)


### Resumable
- The steps outlined above for the acceptance/rejection of a duplicate dataset can be resumed in case of an error occurs in either the API layer or the workflow layer.

---

## UI

- Operators/Admins sees a notification per dataset duplication. Users do not.
- The UI polls for any incoming notifications that haven't been acknowledged yet every 5 seconds.
- Notification shows up in the UI until a duplicate dataset has been either accepted or rejected by an operator/admin.
