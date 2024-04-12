import config from "@/config";

function isDatasetLockedForWrite(dataset) {
  // Assume dataset is locked if it's current state can't be determined
  const datasetLatestState =
    dataset.states && dataset.states?.length > 0
      ? dataset.states[0].state
      : undefined;

  let isLocked;
  if (!dataset.is_duplicate) {
    isLocked = isDatasetBeingOverwritten(dataset);
  } else {
    isLocked =
      datasetLatestState ===
        config.DATASET_STATES.DUPLICATE_ACCEPTANCE_IN_PROGRESS ||
      datasetLatestState ===
        config.DATASET_STATES.DUPLICATE_REJECTION_IN_PROGRESS ||
      datasetLatestState ===
        config.DATASET_STATES.DUPLICATE_DATASET_RESOURCES_PURGED;
  }

  return datasetLatestState ? isLocked : true;
}

function isDatasetBeingOverwritten(dataset) {
  // assumes states are sorted in descending order by timestamp
  const datasetLatestState =
    dataset.states && dataset.states?.length > 0
      ? dataset.states[0].state
      : undefined;

  return (
    datasetLatestState === config.DATASET_STATES.OVERWRITE_IN_PROGRESS ||
    datasetLatestState ===
      config.DATASET_STATES.ORIGINAL_DATASET_RESOURCES_PURGED
  );
}

function datasetHasActiveDuplicates(dataset) {
  return (
    dataset?.duplicated_by?.length > 0 &&
    dataset.duplicated_by.some(
      (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
    )
  );
}

// whether this dataset has incoming duplicates which have not been accepted or
// rejected by the system yet.
function isActiveDatasetWithIncomingDuplicates(dataset) {
  const datasetState = datasetCurrentState(dataset);
  return (
    !dataset.is_duplicate &&
    !dataset.is_deleted &&
    datasetHasActiveDuplicates(dataset) &&
    [
      config.DATASET_STATES.REGISTERED,
      config.DATASET_STATES.READY,
      config.DATASET_STATES.INSPECTED,
      config.DATASET_STATES.ARCHIVED,
      config.DATASET_STATES.FETCHED,
      config.DATASET_STATES.STAGED,
    ].includes(datasetState)
  );
}

function datasetCurrentState(dataset) {
  // assumes states are sorted by descending timestamp
  return (dataset?.states || []).length > 0
    ? dataset.states[0].state
    : undefined;
}

// Returns the dataset that overwrote the current
// dataset (via acceptance of a duplicate into the system)
function overwrittenByDatasetId(dataset) {
  if (!dataset || !dataset.duplicated_by) {
    return undefined;
  }

  // When a dataset overwrites another, it's `is_duplicate` is changed from
  // `true` to `false`
  const duplicationLog = (dataset.duplicated_by || []).find(
    (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
  );

  return duplicationLog ? duplicationLog.duplicate_dataset.id : undefined;
}

export {
  isDatasetBeingOverwritten,
  isDatasetLockedForWrite,
  isActiveDatasetWithIncomingDuplicates,
  datasetHasActiveDuplicates,
  datasetCurrentState,
  overwrittenByDatasetId,
};
