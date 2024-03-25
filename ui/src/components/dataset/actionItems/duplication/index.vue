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
    <div class="flex flex-col gap-3">
      <va-alert v-if="!isActionItemActive" color="warning" class="mx-0">
        This action item is no longer active.
      </va-alert>

      <va-alert
        v-if="isActionItemAcknowledged && isActionItemActive"
        color="success"
        class="mx-0"
      >
        This action item has been acknowledged.
      </va-alert>

      <va-alert
        v-if="isActionItemLocked && isActionItemActive"
        color="warning"
        class="mx-0"
      >
        This action item is currently locked.
      </va-alert>

      <va-alert
        v-if="!isDuplicateDatasetReadyForProcessing && isActionItemActive"
        color="warning"
        class="mx-0"
      >
        Duplicate dataset needs to reach a state of DUPLICATE_READY before it
        can be accepted or rejected. Current state is
        {{ associatedDatasetState }}.
      </va-alert>

      <report-header :action-item="props.actionItem" />

      <report-body :action-item="props.actionItem" />

      <!-- Accept / Reject buttons -->
      <div class="flex gap-2 mt-5">
        <va-button @click="onAcceptClick" :disabled="areControlsDisabled"
          >Accept Duplicate</va-button
        >

        <va-button @click="onRejectClick" :disabled="areControlsDisabled"
          >Reject Duplicate</va-button
        >
      </div>
    </div>

    <accept-modal
      v-model:show-modal="showAcceptModal"
      :action-item="props.actionItem"
      :are-controls-disabled="areControlsDisabled"
      @confirm="acceptDuplicate(props.actionItem.dataset_id)"
    />
    <reject-modal
      v-model:show-modal="showRejectModal"
      :action-item="props.actionItem"
      :are-controls-disabled="areControlsDisabled"
      @confirm="acceptDuplicate(props.actionItem.dataset_id)"
    />

    <!-- add modals with v-model   -->
  </va-inner-loading>
</template>

<script setup>
import ReportHeader from "@/components/dataset/actionItems/duplication/report/ReportHeader.vue";
import ReportBody from "@/components/dataset/actionItems/duplication/report/ReportBody.vue";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import { useNotificationStore } from "@/stores/notification";

const props = defineProps({
  actionItem: {
    type: Object,
    required: true,
  },
  loadingResources: {
    type: Boolean,
    default: false,
  },
});

const notificationStore = useNotificationStore();

const { fetchActiveNotifications } = notificationStore;

// initiated-resolution - emitted once a workflow has been successfully
// launched to either accept or reject a duplicate dataset
const emit = defineEmits(["initiated-resolution"]);

// boolean to indicate if a request to trigger the acceptance or rejection of
// the duplicate dataset is currently in progress.
const initiatingResolution = ref(false);
// aggregate loading indicator for the component
const loading = computed(
  () => props.loadingResources || initiatingResolution.value,
);

const showAcceptModal = ref(false);
const showRejectModal = ref(false);

function onAcceptClick() {
  showAcceptModal.value = true;
}

function onRejectClick() {
  showRejectModal.value = true;
}

function acceptDuplicate(duplicate_dataset_id) {
  initiatingResolution.value = true;
  datasetService
    .accept_duplicate_dataset({
      duplicate_dataset_id: duplicate_dataset_id,
    })
    .then(() => {
      emit("initiated-resolution");
      toast.success("Acceptance of duplicate dataset has been initiated");
    })
    .catch((err) => {
      toast.error("Failed to initiate acceptance of duplicate dataset");
      toast.error(err);
    })
    .finally(() => {
      initiatingResolution.value = false;
      fetchActiveNotifications();
    });
}

function rejectDuplicate(duplicate_dataset_id) {
  initiatingResolution.value = true;
  datasetService
    .reject_duplicate_dataset({
      duplicate_dataset_id: duplicate_dataset_id,
    })
    .then(() => {
      emit("initiated-resolution");
      toast.success("Rejection of duplicate dataset has been initiated");
    })
    .catch((err) => {
      toast.error("Failed to initiate rejection of duplicate dataset");
      toast.error(err);
    })
    .finally(() => {
      initiatingResolution.value = false;
      fetchActiveNotifications();
    });
}

const associatedDataset = computed(() => props.actionItem.dataset);

// the current state of the dataset associated with this action item
const associatedDatasetState = computed(() => {
  // assumes states are sorted by descending timestamp
  const latestState = props.actionItem.dataset.states[0];
  return latestState.state;
});

const originalDataset = computed(() => {
  return props.actionItem.dataset.duplicated_from.original_dataset;
});

const isDuplicateDatasetReadyForProcessing = computed(() => {
  return associatedDatasetState.value === "DUPLICATE_READY";
});

const isActionItemActive = computed(() => {
  return props.actionItem.active;
});

const isActionItemLocked = computed(() => {
  return props.actionItem.status === "LOCKED";
});

const isActionItemAcknowledged = computed(() => {
  return props.actionItem.status === "ACKNOWLEDGED";
});

const areControlsDisabled = computed(() => {
  return (
    isActionItemLocked.value ||
    isActionItemAcknowledged.value ||
    !isActionItemActive.value ||
    !isDuplicateDatasetReadyForProcessing.value
  );
});
</script>
