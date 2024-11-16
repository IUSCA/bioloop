import config from "@/config";
import constants from "@/constants";

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
        constants.DATASET_STATES.READY.DUPLICATE_ACCEPTANCE_IN_PROGRESS ||
      datasetLatestState ===
        constants.DATASET_STATES.READY.DUPLICATE_REJECTION_IN_PROGRESS ||
      datasetLatestState ===
        constants.DATASET_STATES.READY.DUPLICATE_DATASET_RESOURCES_PURGED;
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
    datasetLatestState ===
      constants.DATASET_STATES.READY.OVERWRITE_IN_PROGRESS ||
    datasetLatestState ===
      constants.DATASET_STATES.READY.ORIGINAL_DATASET_RESOURCES_PURGED
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
      constants.DATASET_STATES.READY.REGISTERED,
      constants.DATASET_STATES.READY.READY,
      constants.DATASET_STATES.READY.INSPECTED,
      constants.DATASET_STATES.READY.ARCHIVED,
      constants.DATASET_STATES.READY.FETCHED,
      constants.DATASET_STATES.READY.STAGED,
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
