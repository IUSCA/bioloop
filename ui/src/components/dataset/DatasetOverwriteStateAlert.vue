<template>
  <div>
    <!--
   Shows important alerts regarding the dataset's state.

   Alerts are generated if this dataset is in either of the following states:
   1. Dataset is active and has been duplicated by another dataset.
   -->

    <!-- First, handle cases where current dataset is active (not deleted) -->

    <!-- The current dataset is an active dataset which has incoming duplicates -->
    <div v-if="isActiveDatasetWithIncomingDuplicates">
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
  </div>
</template>

<script setup>
import { isDatasetBeingOverwritten } from "@/services/utils";

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
  return isDatasetBeingOverwritten(props.dataset);
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
    .filter(
      (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
    )
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

// onMounted(() => {
//   console.log("onMounted");
//   console.log("dataset");
//   console.dir(props.dataset, { depth: null });
// });
//
// const datasetWatcher = toRef(() => props.dataset);
//
// watch(datasetWatcher, () => {
//   console.log("watch");
//   console.log("dataset");
//   console.dir(datasetWatcher.value, { depth: null });
// });
</script>
