<template>
  <va-inner-loading :loading="initiatingResolution">
    <div class="flex flex-col gap-3">
      <!-- Guard: no duplication record yet -->
      <va-alert
        v-if="!props.duplication"
        color="warning"
        icon="warning"
        class="mx-0"
      >
        No duplication record found for this dataset. It may not have been
        flagged as a duplicate yet.
      </va-alert>

      <!-- Guard: comparison failed -->
      <va-alert
        v-else-if="comparisonFailed"
        color="danger"
        icon="error"
        class="mx-0"
        data-testid="duplication-comparison-failed"
      >
        The file-level comparison task encountered an error and could not
        complete. Check the task logs for details, then re-trigger the
        comparison from the worker.
      </va-alert>

      <!-- Guard: comparison still running -->
      <va-alert
        v-else-if="comparisonPending"
        color="info"
        class="mx-0"
        data-testid="duplication-comparison-pending"
      >
        <div class="flex items-center gap-3">
          <va-progress-circle
            v-if="fractionPercent !== null"
            :model-value="fractionPercent"
            size="small"
            :thickness="0.3"
            data-testid="duplication-comparison-progress"
          >
            <span class="text-xs">{{ fractionPercent }}%</span>
          </va-progress-circle>
          <va-icon v-else name="sync" class="animate-spin" />
          <span>
            File-level comparison is running (status:
            <strong>{{ props.duplication.comparison_status }}</strong>).
            <span v-if="fractionPercent !== null">
              {{ fractionPercent }}% complete.
            </span>
            The page refreshes automatically.
          </span>
        </div>
      </va-alert>

      <!-- Guard: already resolved — checked before isDuplicateReady because a
           resolved dataset (DUPLICATE_REJECTED / OVERWRITTEN) is no longer in
           the DUPLICATE_READY state, so checking !isDuplicateReady first would
           incorrectly show the "not ready" warning for resolved duplicates. -->
      <va-alert
        v-else-if="isResolved"
        :color="isRejected ? 'danger' : 'success'"
        :icon="isRejected ? 'cancel' : 'check_circle_outline'"
        class="mx-0"
        data-testid="duplication-resolved"
      >
        This duplicate has been
        <strong>{{ isRejected ? "rejected" : "accepted" }}</strong>.
      </va-alert>

      <!-- Guard: not yet DUPLICATE_READY (only relevant for unresolved duplicates) -->
      <va-alert
        v-else-if="!isDuplicateReady"
        color="warning"
        icon="warning"
        class="mx-0"
        data-testid="duplication-not-ready"
      >
        Dataset must reach the
        <strong>{{ config.DATASET_STATES.DUPLICATE_READY }}</strong> state
        before it can be accepted or rejected. Current state:
        <strong>{{ latestState }}</strong>.
      </va-alert>

      <!-- Diff report (always shown when duplication record exists) -->
      <template v-if="props.duplication">
        <duplication-report-header
          :dataset="props.dataset"
          :duplication="props.duplication"
          :original-dataset="props.originalDataset"
        />
        <duplication-report-body
          :ingestion-checks="props.ingestionChecks"
          :duplication="props.duplication"
          :original-dataset="props.originalDataset"
          :duplicate-dataset="props.dataset"
        />
      </template>

      <!-- Admin-only: task logs for the comparison Celery task -->
      <comparison-task-logs
        v-if="props.duplication"
        :comparison-process-id="props.duplication?.comparison_process_id ?? null"
      />

      <!-- Accept / Reject controls -->
      <div
        v-if="props.duplication && !isResolved"
        class="flex gap-5 mt-5"
      >
        <va-button
          data-testid="accept-duplicate-btn"
          @click="showAcceptModal = true"
          :disabled="areControlsDisabled"
        >
          Accept Duplicate
        </va-button>
        <va-button
          data-testid="reject-duplicate-btn"
          @click="showRejectModal = true"
          :disabled="areControlsDisabled"
          preset="plain"
        >
          Reject Duplicate
        </va-button>
      </div>
    </div>

    <duplication-accept-modal
      v-model:show-modal="showAcceptModal"
      :dataset="props.dataset"
      :duplication="props.duplication"
      :are-controls-disabled="areControlsDisabled"
      @confirm="acceptDuplicate"
    />
    <duplication-reject-modal
      v-model:show-modal="showRejectModal"
      :dataset="props.dataset"
      :duplication="props.duplication"
      :are-controls-disabled="areControlsDisabled"
      @confirm="rejectDuplicate"
    />
  </va-inner-loading>
</template>

<script setup>
import DuplicationAcceptModal from "@/components/dataset/actionItems/duplication/modal/AcceptModal.vue";
import DuplicationRejectModal from "@/components/dataset/actionItems/duplication/modal/RejectModal.vue";
import DuplicationReportBody from "@/components/dataset/actionItems/duplication/report/ReportBody.vue";
import DuplicationReportHeader from "@/components/dataset/actionItems/duplication/report/ReportHeader.vue";
import ComparisonTaskLogs from "@/components/dataset/actionItems/duplication/ComparisonTaskLogs.vue";
import config from "@/config";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";

const props = defineProps({
  dataset: { type: Object, required: true },
  duplication: { type: Object, default: null },
  ingestionChecks: { type: Array, default: () => [] },
  originalDataset: { type: Object, default: null },
});

const emit = defineEmits(["resolution-complete"]);

const initiatingResolution = ref(false);
const showAcceptModal = ref(false);
const showRejectModal = ref(false);

const latestState = computed(() => props.dataset?.states?.[0]?.state || null);
const isDuplicateReady = computed(
  () => latestState.value === config.DATASET_STATES.DUPLICATE_READY,
);
const isRejected = computed(
  () => latestState.value === config.DATASET_STATES.DUPLICATE_REJECTED,
);
// isAccepted: the accept flow sets is_duplicate=false without adding a new state,
// so the accepted duplicate stays in DUPLICATE_READY with is_duplicate=false.
const isAccepted = computed(
  () => isDuplicateReady.value && !props.dataset?.is_duplicate,
);
const isResolved = computed(() => isRejected.value || isAccepted.value);

// Comparison is still in flight when status is PENDING or RUNNING
const comparisonPending = computed(() => {
  const s = props.duplication?.comparison_status;
  return s === "PENDING" || s === "RUNNING";
});

const comparisonFailed = computed(
  () => props.duplication?.comparison_status === "FAILED",
);

// Convert the stored fraction (0.0–1.0) to an integer percentage for display.
const fractionPercent = computed(() => {
  const f = props.duplication?.comparison_fraction_done;
  if (f == null) return null;
  return Math.round(f * 100);
});

// Auto-refresh the report while comparison is in flight so the UI stays current.
const POLL_INTERVAL_MS = 5000;
const { pause: pausePoll, resume: resumePoll } = useIntervalFn(() => {
  if (comparisonPending.value) {
    emit("resolution-complete");
  }
}, POLL_INTERVAL_MS, { immediate: false });

watch(
  () => comparisonPending.value,
  (pending) => {
    if (pending) resumePoll();
    else pausePoll();
  },
  { immediate: true },
);

const areControlsDisabled = computed(
  () =>
    !isDuplicateReady.value ||
    comparisonPending.value ||
    isResolved.value,
);

function acceptDuplicate() {
  initiatingResolution.value = true;
  datasetService
    .accept_duplicate_dataset({ duplicate_dataset_id: props.dataset.id })
    .then(() => {
      toast.success("Duplicate dataset accepted");
      emit("resolution-complete");
    })
    .catch((err) => {
      toast.error("Failed to accept duplicate dataset");
      console.error(err);
    })
    .finally(() => {
      initiatingResolution.value = false;
    });
}

function rejectDuplicate() {
  initiatingResolution.value = true;
  datasetService
    .reject_duplicate_dataset({ duplicate_dataset_id: props.dataset.id })
    .then(() => {
      toast.success("Duplicate dataset rejected");
      emit("resolution-complete");
    })
    .catch((err) => {
      toast.error("Failed to reject duplicate dataset");
      console.error(err);
    })
    .finally(() => {
      initiatingResolution.value = false;
    });
}
</script>
