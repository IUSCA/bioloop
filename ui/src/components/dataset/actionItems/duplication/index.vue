<template>
  <va-inner-loading :loading="initiatingResolution">
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
        v-if="
          !isDuplicateDatasetReadyForProcessing &&
          !isActionItemAcknowledged &&
          isActionItemActive
        "
        color="warning"
        class="mx-0"
      >
        Duplicate dataset needs to reach a state of
        {{ config.DATASET_STATES.DUPLICATE_READY }} before it can be accepted or
        rejected. Current state is {{ associatedDatasetState }}.
      </va-alert>

      <va-alert
        v-if="
          isDuplicateDatasetReadyForProcessing &&
          !isActionItemAcknowledged &&
          isActionItemActive &&
          datasetHasPendingWorkflows
        "
        color="warning"
        class="mx-0"
      >
        Dataset
        <a
          :href="`/datasets/${props.actionItem?.dataset.duplicated_from.original_dataset_id}`"
          >{{
            props.actionItem?.dataset.duplicated_from.original_dataset.name
          }}</a
        >
        cannot be overwritten because it has pending workflows.
      </va-alert>

      <!-- The report generated for this duplication -->
      <duplication-report-header :action-item="props.actionItem" />
      <duplication-report-body
        :ingestion-checks="props.ingestionChecks"
        :original-dataset="props.actionItem?.dataset.duplicated_from.original_dataset"
        :duplicate-dataset="props.actionItem?.dataset.duplicated_from.duplicate_dataset"
      />

      <!-- Accept / Reject buttons -->
      <div class="flex gap-5 mt-5">
        <va-button @click="onAcceptClick" :disabled="areControlsDisabled"
          >Accept Duplicate</va-button
        >

        <va-button
          @click="onRejectClick"
          :disabled="areControlsDisabled"
          preset="plain"
          >Reject Duplicate</va-button
        >
      </div>
    </div>

    <duplication-accept-modal
      v-model:show-modal="showAcceptModal"
      :action-item="props.actionItem"
      :are-controls-disabled="areControlsDisabled"
      @confirm="acceptDuplicate(props.actionItem?.dataset_id)"
    />
    <duplication-reject-modal
      v-model:show-modal="showRejectModal"
      :action-item="props.actionItem"
      :are-controls-disabled="areControlsDisabled"
      @confirm="rejectDuplicate(props.actionItem?.dataset_id)"
    />
  </va-inner-loading>
</template>

<script setup>
import DuplicationAcceptModal from "@/components/dataset/actionItems/duplication/modal/AcceptModal.vue";
import DuplicationRejectModal from "@/components/dataset/actionItems/duplication/modal/RejectModal.vue";
import DuplicationReportBody from "@/components/dataset/actionItems/duplication/report/ReportBody.vue";
import DuplicationReportHeader from "@/components/dataset/actionItems/duplication/report/ReportHeader.vue";
import config from "@/config";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import { useNotificationStore } from "@/stores/notification";

const props = defineProps({
  actionItem: {
    type: Object,
    required: true,
  },
  ingestionChecks: {
    type: Array,
    default: () => [],
  },
  datasetWorkflows: {
    type: Array,
    default: () => [],
  },
  loadingResources: {
    type: Boolean,
    default: false,
  },
});

console.log('index.vue props.ingestionChecks');
console.log(props.ingestionChecks);
console.log('index.vue props.actionItem');
console.log(props.actionItem);

const notificationStore = useNotificationStore();

const { fetchActiveNotifications } = notificationStore;

// initiated-resolution - emitted once a workflow has been successfully
// launched to either accept or reject a duplicate dataset
const emit = defineEmits(["initiated-resolution"]);

// boolean to indicate if a request to trigger the acceptance or rejection of
// the duplicate dataset is currently in progress.
const initiatingResolution = ref(false);
// aggregate loading indicator for the component

const showAcceptModal = ref(false);
const showRejectModal = ref(false);

function onAcceptClick() {
  showAcceptModal.value = true;
}

function onRejectClick() {
  showRejectModal.value = true;
}

const datasetHasPendingWorkflows = computed(() => {
  return props.datasetWorkflows.length > 0;
});

function acceptDuplicate(duplicate_dataset_id) {
  initiatingResolution.value = true;
  datasetService
    .accept_duplicate_dataset({
      duplicate_dataset_id: duplicate_dataset_id,
    })
    .then(() => {
      toast.success("Acceptance of duplicate dataset has been initiated");
    })
    .catch((err) => {
      toast.error("Failed to initiate acceptance of duplicate dataset");
      toast.error(err);
    })
    .finally(() => {
      emit("initiated-resolution");
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
      toast.success("Rejection of duplicate dataset has been initiated");
    })
    .catch((err) => {
      toast.error("Failed to initiate rejection of duplicate dataset");
      toast.error(err);
    })
    .finally(() => {
      emit("initiated-resolution");
      initiatingResolution.value = false;
      fetchActiveNotifications();
    });
}

// the current state of the dataset associated with this action item
const associatedDatasetState = computed(() => {
  // assumes states are sorted by descending timestamp
  console.log("associatedDatasetState:");
  console.log(props.actionItem?.dataset);
  const latestState = props.actionItem?.dataset?.states?.length > 0 ? props.actionItem.dataset.states[0] : null;
  return latestState?.state || undefined;
});

const isDuplicateDatasetReadyForProcessing = computed(() => {
  return associatedDatasetState.value === config.DATASET_STATES.DUPLICATE_READY;
});

const isActionItemActive = computed(() => {
  return props.actionItem?.status === "CREATED";
});

const isActionItemAcknowledged = computed(() => {
  return props.actionItem?.status === "RESOLVED";
});

const areControlsDisabled = computed(() => {
  return (
    isActionItemAcknowledged.value ||
    !isActionItemActive.value ||
    !isDuplicateDatasetReadyForProcessing.value ||
    datasetHasPendingWorkflows.value
  );
});

onMounted(() => {
  console.log("index.vue mounted")
})
</script>
