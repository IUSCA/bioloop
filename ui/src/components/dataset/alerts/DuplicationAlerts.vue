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
          v-if="
            props.dataset?.action_items?.length > 0 &&
            (auth.canAdmin || auth.canOperate)
          "
          @click="
            () => {
              // exactly one action item is created
              // for a dataset duplication
              router.push(
                `/datasets/${props.dataset.id}/actionItems/${props.dataset.action_items[0].id}`,
              );
            }
          "
        >
          Accept/Reject duplicate
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

    <!-- The current dataset is an active dataset which has incoming duplicates,
     or one that is currently being overwritten by a duplicate. -->
    <DuplicatedByAlerts :dataset="props.dataset" />

    <!-- The current dataset is being overwritten by another dataset -->
    <OverwriteInProgressAlert :dataset="props.dataset" />

    <!-- The current dataset has been overwritten by another dataset -->
    <va-alert v-if="isInactiveOverwrittenDataset" color="danger">
      This dataset has been overwritten by duplicate
      <a :href="`/datasets/${overwrittenByDatasetId(props.dataset)}`">
        #{{ overwrittenByDatasetId(props.dataset) }}
      </a>
    </va-alert>

    <!-- The current dataset is an active dataset which is currently being overwritten by its duplicate. -->
    <va-alert v-if="isActiveDuplicateBeingRejected" color="warning">
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
import { datasetCurrentState } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import config from "@/config";

const router = useRouter();
const auth = useAuthStore();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const datasetState = computed(() => datasetCurrentState(props.dataset));

// whether this dataset is an active (not deleted) duplicate of another, whose
// acceptance or rejection has not yet been initiated.
const isActiveDuplicatePendingAction = computed(
  () =>
    props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    (datasetState.value === config.DATASET_STATES.DUPLICATE_REGISTERED || // state of duplicate upon registration
      datasetState.value === config.DATASET_STATES.READY || // state of duplicate after `await_stability` step
      datasetState.value === config.DATASET_STATES.INSPECTED || // state of duplicate after `inspect` step
      datasetState.value === config.DATASET_STATES.DUPLICATE_READY), // state of duplicate after running a comparison of
  // duplicate dataset with the original dataset.
);

// whether this dataset is an active duplicate of another, and is currently
// undergoing the process of replacing the original dataset.
const isActiveDuplicateBeingAccepted = computed(() => {
  return (
    props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    datasetState.value ===
      config.DATASET_STATES.DUPLICATE_ACCEPTANCE_IN_PROGRESS
  );
});

const isInactiveOverwrittenDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === config.DATASET_STATES.OVERWRITTEN
  );
});

const isActiveDuplicateBeingRejected = computed(() => {
  return (
    datasetState.value ===
      config.DATASET_STATES.DUPLICATE_REJECTION_IN_PROGRESS ||
    datasetState.value ===
      config.DATASET_STATES.DUPLICATE_DATASET_RESOURCES_PURGED
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

  return duplicationLog ? duplicationLog.duplicate_dataset.id : undefined;
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
