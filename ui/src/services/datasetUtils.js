import config from "@/config";

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
function overwrittenByDataset(dataset) {
  if (!dataset || !dataset.duplicated_by) {
    return undefined;
  }

  // When a dataset overwrites another, it's `is_duplicate` is changed from
  // `true` to `false`
  const duplicationLog = (dataset.duplicated_by || []).find(
    (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
  );

  return duplicationLog ? duplicationLog.duplicate_dataset : undefined;
}

export {
  isActiveDatasetWithIncomingDuplicates,
  datasetHasActiveDuplicates,
  datasetCurrentState,
  overwrittenByDataset,
};
