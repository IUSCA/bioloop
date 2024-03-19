<template>
  <va-inner-loading :loading="loading">
    <!--
   Displays a report for each check performed in the process of determining
   whether two datasets are the same.

   The following checks are performed in the current process:
   1. Comparing number of files in both datasets
   2. Comparing checksums of files in both datasets
   3. Verifying if any files from the original dataset are missing from the incoming duplicate.
   4. Verifying if any files from the incoming duplicate dataset are missing from the original.
  -->
    <div class="flex flex-col gap-3" v-if="actionItem">
      <va-alert v-if="!isActionItemActive" color="warning" class="mx-0">
        This action item is no longer active.
      </va-alert>

      <va-alert v-if="isActionItemLocked" color="warning" class="mx-0">
        This action item is currently locked.
      </va-alert>

      <va-alert
        v-else-if="!isDuplicateReadyForProcessing"
        color="warning"
        class="mx-0"
      >
        Duplicate dataset needs to reach a state of DUPLICATE_READY before it
        can be accepted or rejected. Current state is
        {{ associatedDatasetState }}.
      </va-alert>

      <report-header :action-item="actionItem" />

      <report-body :action-item="actionItem" />

      <!-- Accept / Reject buttons -->
      <div class="flex gap-2 mt-5">
        <va-button
          @click="acceptDuplicate(actionItem.dataset_id)"
          :disabled="areControlsDisabled"
          >Accept Duplicate</va-button
        >

        <va-button
          @click="rejectDuplicate(actionItem.dataset_id)"
          :disabled="areControlsDisabled"
          >Reject Duplicate</va-button
        >
      </div>
    </div>
  </va-inner-loading>
</template>

<script setup>
import ReportBody from "@/components/dataset/actionItems/datasetDiffReport/ReportBody.vue";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";

const props = defineProps({
  actionItemId: {
    type: String,
    required: true,
  },
});

// boolean to indicate if the action item is being retrieved
const retrievingActionItem = ref(false);
// boolean to indicate if a request to trigger the acceptance or rejection of the duplicate dataset
// is currently in progress.
const initiatingResolution = ref(false);
// aggregate loading indicator for the component
const loading = computed(
  () => retrievingActionItem.value || initiatingResolution.value,
);

const reTriggerActionItemRetrieval = ref(false);
const actionItem = ref(null);

const fetchActionItemDetails = ({
  actionItemId,
  updateRetrievalTrigger = false,
} = {}) => {
  retrievingActionItem.value = true;
  return datasetService
    .getActionItem({ action_item_id: actionItemId })
    .then((res) => {
      actionItem.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch action item details");
      toast.error(err);
    })
    .finally(() => {
      retrievingActionItem.value = false;
      if (updateRetrievalTrigger) {
        reTriggerActionItemRetrieval.value = false;
      }
    });
};

function acceptDuplicate(duplicate_dataset_id) {
  initiatingResolution.value = true;
  datasetService
    .accept_duplicate_dataset({
      duplicate_dataset_id: duplicate_dataset_id,
    })
    .then(() => {
      reTriggerActionItemRetrieval.value = true;
      toast.success("Acceptance of duplicate dataset has been initiated");
    })
    .catch((err) => {
      toast.error("Failed to initiate acceptance of duplicate dataset");
      toast.error(err);
    })
    .finally(() => {
      initiatingResolution.value = false;
    });
}

function rejectDuplicate(duplicate_dataset_id) {
  initiatingResolution.value = true;
  datasetService
    .reject_duplicate_dataset({
      duplicate_dataset_id: duplicate_dataset_id,
    })
    .then(() => {
      reTriggerActionItemRetrieval.value = true;
      toast.success("Rejection of duplicate dataset has been initiated");
    })
    .catch((err) => {
      toast.error("Failed to initiate rejection of duplicate dataset");
      toast.error(err);
    })
    .finally(() => {
      initiatingResolution.value = false;
    });
}

// the current state of the dataset associated with this action item
const associatedDatasetState = computed(() => {
  // assumes states are sorted by descending timestamp
  const latestState = actionItem.value.dataset.states[0];
  return latestState.state;
});

const isDuplicateReadyForProcessing = computed(() => {
  return associatedDatasetState.value === "DUPLICATE_READY";
});

const isActionItemActive = computed(() => {
  return actionItem.value.active;
});

const isActionItemLocked = computed(() => {
  return actionItem.value.status === "LOCKED";
});

const areControlsDisabled = computed(() => {
  return (
    isActionItemLocked.value ||
    !isActionItemActive.value ||
    !isDuplicateReadyForProcessing.value
  );
});

watch(reTriggerActionItemRetrieval, () => {
  if (reTriggerActionItemRetrieval.value) {
    fetchActionItemDetails({
      actionItemId: props.actionItemId,
      updateRetrievalTrigger: true,
    });
  }
});

onMounted(() => {
  fetchActionItemDetails({ actionItemId: props.actionItemId });
});
</script>
