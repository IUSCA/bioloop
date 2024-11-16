<template>
  <div>
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

        <!-- Allow authorized users to see any active action items for this duplication -->
        <va-button
          v-if="
            props.dataset?.action_items?.length > 0 &&
            (auth.canAdmin || auth.canOperate)
          "
          @click="
            () => {
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

    <!-- The current dataset is an active dataset which has incoming duplicates -->
    <DuplicatedByAlerts :dataset="props.dataset" />

    <!-- The current dataset is being overwritten by another dataset -->
    <OverwriteInProgressAlert :dataset="props.dataset" />

    <!-- The current dataset has been overwritten by another dataset -->
    <va-alert v-if="isInactiveOverwrittenDataset" color="danger">
      This dataset has been overwritten by duplicate
      <a :href="`/datasets/${_overwrittenByDatasetId}`">
        #{{ _overwrittenByDatasetId }}
      </a>
    </va-alert>

    <!-- The current dataset is an active duplicate which is currently being rejected. -->
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

    <!-- The current dataset has been (soft-) deleted -->
    <va-alert v-if="isInactiveDataset" color="danger">
      This dataset has been deleted
    </va-alert>
  </div>
</template>

<script setup>
import {
  datasetCurrentState,
  overwrittenByDatasetId,
} from "@/services/datasetUtils";
import { useAuthStore } from "@/stores/auth";
import config from "@/config";
import constants from "@/constants";

const router = useRouter();
const auth = useAuthStore();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const _overwrittenByDatasetId = computed(() =>
  overwrittenByDatasetId(props.dataset),
);

const datasetState = computed(() => datasetCurrentState(props.dataset));

// whether this dataset is an active (not deleted) duplicate of another, whose
// acceptance or rejection has not yet been initiated.
const isActiveDuplicatePendingAction = computed(
  () =>
    props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    (datasetState.value === constants.DATASET_STATES.DUPLICATE_REGISTERED || // state of duplicate upon registration
      datasetState.value === constants.DATASET_STATES.READY.READY || // state of duplicate after `await_stability` step
      datasetState.value === constants.DATASET_STATES.READY.INSPECTED || // state of duplicate after `inspect` step
      datasetState.value === constants.DATASET_STATES.READY.DUPLICATE_READY), // state of duplicate after running a comparison of
  // duplicate dataset with the original dataset.
);

// whether this dataset is an active duplicate of another, and is currently
// undergoing the process of replacing the original dataset.
const isActiveDuplicateBeingAccepted = computed(() => {
  return (
    props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    datasetState.value ===
      constants.DATASET_STATES.READY.DUPLICATE_ACCEPTANCE_IN_PROGRESS
  );
});

// whether this dataset has been overwritten by a duplicate
const isInactiveOverwrittenDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === constants.DATASET_STATES.READY.OVERWRITTEN
  );
});

// whether this dataset is a duplicate that is currently being rejected.
const isActiveDuplicateBeingRejected = computed(() => {
  return (
    datasetState.value ===
      constants.DATASET_STATES.READY.DUPLICATE_REJECTION_IN_PROGRESS ||
    datasetState.value ===
      constants.DATASET_STATES.READY.DUPLICATE_DATASET_RESOURCES_PURGED
  );
});

// whether this dataset is a rejected duplicate of another.
const isInactiveRejectedDuplicate = computed(() => {
  return (
    props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === constants.DATASET_STATES.READY.DUPLICATE_REJECTED
  );
});

// whether this dataset has been soft-deleted
const isInactiveDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === constants.DATASET_STATES.READY.DELETED
  );
});
</script>
