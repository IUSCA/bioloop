<template>
  <div>
    <!--
   Shows important alerts regarding the dataset's state.

   Alerts are generated if this dataset is in either of the following states:
   1. Dataset is active and is a duplicate of another dataset, and is currently pending acceptance into the system.
   2. Dataset is active and has been duplicated by another dataset.
   3. Dataset has been deleted via a soft-delete
   4. Dataset has been deleted on account of being a rejected duplicate of an another dataset.
   5. Dataset has been deleted on account of being overwritten by another dataset (a dataset
   reaches this state once it's duplicate dataset has been accepted into the system).
  -->

    <!-- First, handle cases where current dataset is active (not deleted) -->

    <!-- The current dataset is an active duplicate of another -->
    <va-alert v-if="isActiveDuplicatePendingAction" color="warning">
      <div class="flex items-center">
        <div class="flex-auto">
          <div>
            This dataset has been duplicated from
            <a
              :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
            >
              #{{ props.dataset.duplicated_from?.original_dataset_id }}
            </a>
          </div>
        </div>

        <!-- Allow users to see any active action items for this duplication -->
        <va-button
          @click="
            () => {
              // duplicateDataset.action_items[0] is sufficient because exactly one action item is created
              // for a dataset duplication
              router.push(
                `/datasets/${props.dataset.id}/actionItems/${props.dataset.action_items[0].id}`,
              );
            }
          "
        >
          Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
        </va-button>
      </div>
    </va-alert>

    <!-- The current dataset is an active duplicate of another, and is currently overwriting the original. -->
    <va-alert v-else-if="isActiveDuplicateBeingAccepted" color="warning">
      <div class="flex items-center">
        <div class="flex-auto">
          <div>
            This dataset overwrites
            <a
              :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
            >
              #{{ props.dataset.duplicated_from?.original_dataset_id }} </a
            >, and is currently being integrated into the system.
          </div>
        </div>
      </div>
    </va-alert>

    <!-- The current dataset is an active dataset which has incoming duplicates -->
    <div v-else-if="isActiveDatasetWithIncomingDuplicates">
      <va-alert
        v-for="(duplicateDataset, index) in duplicateDatasets"
        color="warning"
        :key="index"
        :class="index < duplicateDatasets.length ? 'mb-2' : ''"
      >
        <div class="flex items-center">
          <div class="flex-auto">
            This dataset has been duplicated by
            <a :href="`/datasets/${duplicateDataset.id}`">
              #{{ duplicateDataset.id }}
            </a>
          </div>

          <!-- Allow users to see visit the action item for this duplication -->
          <va-button
            v-if="duplicateDataset.action_items.length > 0"
            @click="
              () => {
                // duplicateDataset.action_items[0] is sufficient because exactly one action item is created
                // for a dataset duplication
                router.push(
                  `/datasets/${duplicateDataset.id}/actionItems/${duplicateDataset.action_items[0].id}`,
                );
              }
            "
          >
            Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
          </va-button>
        </div>
      </va-alert>
    </div>

    <!-- The current dataset is an active dataset which is currently being overwritten by its duplicate. -->
    <va-alert v-else-if="isActiveDatasetBeingOverwritten" color="warning">
      This dataset is currently being overwritten by duplicate
      <a :href="`/datasets/${overwrittenByDatasetId(props.dataset)}`">
        #{{ overwrittenByDatasetId(props.dataset) }}
      </a>
    </va-alert>

    <!-- The current dataset has been overwritten by another dataset -->
    <va-alert v-else-if="isInactiveOverwrittenDataset" color="danger">
      This dataset has been overwritten by duplicate
      <a :href="`/datasets/${overwrittenByDatasetId(props.dataset)}`">
        #{{ overwrittenByDatasetId(props.dataset) }}
      </a>
    </va-alert>

    <!-- The current dataset is an active dataset which is currently being overwritten by its duplicate. -->
    <va-alert v-else-if="isActiveDuplicateBeingRejected" color="warning">
      This dataset is a duplicate of
      <a
        :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
      >
        #{{ props.dataset.duplicated_from?.original_dataset_id }}
      </a>
      and is currently being rejected by the system.
    </va-alert>

    <!-- The current dataset is a rejected duplicate of another -->
    <va-alert v-else-if="isInactiveRejectedDuplicate" color="danger">
      This dataset is a rejected duplicate of
      <a
        :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
      >
        #{{ props.dataset.duplicated_from?.original_dataset_id }}
      </a>
    </va-alert>

    <!-- The current dataset has been deleted (soft-delete) -->
    <va-alert v-if="isInactiveDataset" color="danger">
      This dataset has been deleted
    </va-alert>
    <!-- Now, handle cases where current dataset has been deleted. -->

    <!-- Any of the following states (DUPLICATE_REJECTED, DELETED, OVERWRITTEN) will only be reached once
    the current dataset has been deleted. -->
  </div>
</template>

<script setup>
const router = useRouter();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

// Gather and sort all duplicates of the current dataset
const duplicateDatasets = computed(() =>
  gatherDatasetDuplicates(props.dataset),
);

const datasetState = computed(() => currentState(props.dataset));

// whether this dataset is an active (not deleted) duplicate of another, whose
// acceptance or rejection has not yet been initiated.
const isActiveDuplicatePendingAction = computed(
  () =>
    props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    (datasetState.value === "DUPLICATE_REGISTERED" || // state of duplicate upon registration
      datasetState.value === "READY" || // state of duplicate after `await_stability` step
      datasetState.value === "INSPECTED" || // state of duplicate after `inspect` step
      datasetState.value === "DUPLICATE_READY"), // state of duplicate after running a comparison of
  // duplicate dataset with the original dataset.
);

// whether this dataset is an active duplicate of another, and is currently
// undergoing the process of replacing the original dataset.
const isActiveDuplicateBeingAccepted = computed(() => {
  return (
    props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    datasetState.value === "DUPLICATE_ACCEPTANCE_IN_PROGRESS"
  );
});

// whether this dataset has incoming duplicates which have not been accepted or
// rejected by the system yet.
const isActiveDatasetWithIncomingDuplicates = computed(
  () =>
    !props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    hasActiveDuplicates(props.dataset) &&
    [
      "REGISTERED",
      "READY",
      "INSPECTED",
      "ARCHIVED",
      "FETCHED",
      "STAGED",
    ].includes(datasetState.value),
);

// whether this dataset was duplicated by another, and is currently undergoing
// the process of being replaced by its duplicate.
const isActiveDatasetBeingOverwritten = computed(() => {
  return (
    datasetState.value === "OVERWRITE_IN_PROGRESS" ||
    datasetState.value === "ORIGINAL_DATASET_RESOURCES_PURGED"
  );
});

const isInactiveOverwrittenDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === "OVERWRITTEN"
  );
});

// todo change state DUPLICATE_REJECTION_IN_PROGRESS to
// DUPLICATE_REJECTION_INITIATED whether this dataset was duplicated by another,
// and is currently undergoing the process of being replaced by its duplicate.
const isActiveDuplicateBeingRejected = computed(() => {
  return (
    datasetState.value === "DUPLICATE_REJECTION_IN_PROGRESS" ||
    datasetState.value === "DUPLICATE_DATASET_RESOURCES_PURGED"
  );
});

const isInactiveRejectedDuplicate = computed(() => {
  return (
    props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === "DUPLICATE_REJECTED"
  );
});

// dataset has been soft-deleted
const isInactiveDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === "DELETED"
  );
});

const currentState = (dataset) => {
  // assumes states are sorted by descending timestamp
  return (dataset.states || []).length > 0 ? dataset.states[0].state : null;
};

// Returns the dataset that overwrote the current
// dataset (via acceptance of a duplicate into the system)
const overwrittenByDatasetId = (dataset) => {
  if (!dataset || !dataset.duplicated_by) {
    return undefined;
  }

  // When a dataset overwrites another, it's `is_duplicate` is changed from
  // `true` to `false`
  const duplicationLog = (dataset.duplicated_by || []).find(
    (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
  );

  console.log(`duplicationLog.duplicate_dataset:`);
  console.dir(duplicationLog.duplicate_dataset, { depth: null });

  return duplicationLog ? duplicationLog.duplicate_dataset.id : undefined;
};

const gatherDatasetDuplicates = (dataset) =>
  (dataset?.duplicated_by || [])
    .map((duplicationRecord) => duplicationRecord.duplicate_dataset)
    // sort duplicates by version - most recent version first
    .sort((duplicate1, duplicate2) => duplicate2.version - duplicate1.version);

const hasActiveDuplicates = (dataset) => {
  return (
    dataset.duplicated_by?.length > 0 &&
    dataset.duplicated_by.some(
      (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
    )
  );
};

onMounted(() => {
  console.log("onMounted");
  console.log("dataset");
  console.dir(props.dataset, { depth: null });
});

const datasetWatcher = toRef(() => props.dataset);

watch(datasetWatcher, () => {
  console.log("watch");
  console.log("dataset");
  console.dir(datasetWatcher.value, { depth: null });
});
</script>
