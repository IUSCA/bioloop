<template>
  <div>
    <!-- The current dataset is an active duplicate of another -->
    <va-alert
      v-if="isActiveDuplicatePendingAction && isAuthorized"
      color="warning"
      data-testid="duplication-alert-pending"
    >
      <div class="flex items-center">
        <div class="flex-auto">
          <div>
            This dataset has been duplicated from
            <a
              :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
            >
              {{ props.dataset.duplicated_from?.original_dataset?.name }}
            </a>
          </div>
        </div>

        <!-- Allow authorized users to navigate to the duplication report -->
        <va-button
          data-testid="duplication-alert-accept-reject-btn"
          @click="router.push(`/datasets/${props.dataset.id}/duplication`)"
        >
          Accept/Reject duplicate
        </va-button>
      </div>
    </va-alert>

    <!-- The current dataset is an active dataset which has incoming duplicates -->
    <DuplicatedByAlerts :dataset="props.dataset" />

    <!-- The current dataset has been overwritten by another dataset.
         Only shown to operators/admins — reveals duplication context. -->
    <va-alert
      v-if="isInactiveOverwrittenDataset && isAuthorized"
      color="danger"
      data-testid="duplication-alert-overwritten"
    >
      This dataset has been overwritten by duplicate
      <a :href="`/datasets/${_overwrittenByDataset?.id}`">
        {{ _overwrittenByDataset?.name }}
      </a>
    </va-alert>

    <!-- The current dataset is a rejected duplicate of another.
         Only shown to operators/admins — reveals duplication context. -->
    <va-alert
      v-else-if="isInactiveRejectedDuplicate && isAuthorized"
      color="danger"
      data-testid="duplication-alert-rejected-duplicate"
    >
      This dataset is a rejected duplicate of
      <a
        :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
      >
        {{ props.dataset.duplicated_from?.original_dataset?.name }}
      </a>
    </va-alert>

    <!-- The current dataset has been (soft-) deleted.
         Shown to all roles — no duplication context exposed. -->
    <va-alert
      v-if="isInactiveDataset"
      color="danger"
      data-testid="duplication-alert-deleted"
    >
      This dataset has been deleted
    </va-alert>
  </div>
</template>

<script setup>
import {
  datasetCurrentState,
  overwrittenByDataset,
} from "@/services/datasetUtils";
import { useAuthStore } from "@/stores/auth";
import config from "@/config";
import { storeToRefs } from "pinia";

const router = useRouter();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const { canAdmin, canOperate } = storeToRefs(useAuthStore());

const isAuthorized = computed(() => canAdmin.value || canOperate.value);

const _overwrittenByDataset = computed(() =>
  overwrittenByDataset(props.dataset),
);

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

// whether this dataset has been overwritten by a duplicate
const isInactiveOverwrittenDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === config.DATASET_STATES.OVERWRITTEN
  );
});

// whether this dataset is a rejected duplicate of another.
const isInactiveRejectedDuplicate = computed(() => {
  return (
    props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === config.DATASET_STATES.DUPLICATE_REJECTED
  );
});

// whether this dataset has been soft-deleted
const isInactiveDataset = computed(() => {
  return (
    !props.dataset.is_duplicate &&
    props.dataset.is_deleted &&
    datasetState.value === config.DATASET_STATES.DELETED
  );
});
</script>
