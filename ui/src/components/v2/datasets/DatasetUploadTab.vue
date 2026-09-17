<template>
  <div class="space-y-3">
    <div v-if="loading" class="flex flex-col gap-2 py-2">
      <VaSkeleton v-for="n in 3" :key="n" variant="rounded" height="40px" />
    </div>

    <div v-else-if="error" class="py-8 px-6">
      <ErrorState
        title="Failed to load the upload log"
        :message="error"
        @retry="fetchLog"
      />
    </div>

    <div v-else-if="!log" class="py-8 px-6">
      <EmptyState
        icon="mdi-cloud-off-outline"
        title="Not an upload"
        message="This dataset was not uploaded from a browser, so there is no upload log."
      />
    </div>

    <div v-else class="space-y-3">
      <!--
        The status is the whole point of this panel. An upload that fails for good is
        tombstoned, so the dataset itself reads as deleted everywhere else and this is the
        only place that says why.
        @see docs/design/groups/dataset-creation.md — Watching an upload afterwards
      -->
      <div class="flex items-center gap-3 flex-wrap">
        <Badge :color="badgeColor">{{ readableStatus }}</Badge>
        <span class="text-sm va-text-secondary">{{ explanation }}</span>
      </div>

      <VaAlert v-if="failureReason" color="danger" outline class="text-sm">
        {{ failureReason }}
      </VaAlert>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div v-for="row in detailRows" :key="row.label" class="flex gap-2">
          <span class="va-text-secondary shrink-0">{{ row.label }}</span>
          <span class="font-medium break-all">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import DatasetService from "@/services/v2/datasets";

const props = defineProps({
  datasetId: { type: String, required: true },
});

const log = ref(null);
const loading = ref(true);
const error = ref(null);

// What each status means, in the words someone waiting on their own upload would use.
const EXPLANATIONS = {
  UPLOADING: "Files are still being sent from the uploader's browser.",
  UPLOAD_FAILED: "The transfer stopped before every file arrived.",
  UPLOADED: "Every file arrived. Waiting for a worker to check them.",
  VERIFYING:
    "A worker is checking the files against the checksums the browser computed.",
  VERIFIED: "The files match. Waiting for registration to start.",
  VERIFICATION_FAILED:
    "The files did not match the checksums the browser computed.",
  PROCESSING: "Registration is running.",
  PROCESSING_FAILED: "Registration failed.",
  COMPLETE: "The upload finished and the dataset is registered.",
  PERMANENTLY_FAILED:
    "Every retry has been used. This upload will not be retried again.",
};

const FAILED = [
  "UPLOAD_FAILED",
  "VERIFICATION_FAILED",
  "PROCESSING_FAILED",
  "PERMANENTLY_FAILED",
];

const readableStatus = computed(() =>
  (log.value?.status ?? "").replaceAll("_", " ").toLowerCase(),
);

const explanation = computed(() => EXPLANATIONS[log.value?.status] ?? "");

const badgeColor = computed(() => {
  if (FAILED.includes(log.value?.status)) return "danger";
  if (log.value?.status === "COMPLETE") return "success";
  return "warning";
});

const failureReason = computed(
  () => log.value?.metadata?.failure_reason ?? null,
);

const detailRows = computed(() => {
  if (!log.value) return [];
  const rows = [
    {
      label: "Last updated",
      value: datetime.displayDateTime(log.value.updated_at),
    },
    { label: "Retries", value: String(log.value.retry_count ?? 0) },
  ];
  if (log.value.process_id) {
    rows.push({ label: "Transfer id", value: log.value.process_id });
  }
  return rows;
});

async function fetchLog() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await DatasetService.uploadLog(props.datasetId);
    log.value = data;
  } catch (err) {
    // The route answers 404 for a dataset that was never uploaded. That is not an error
    // worth showing as one; the empty state says so plainly instead.
    if (err?.response?.status === 404) {
      log.value = null;
    } else {
      error.value =
        err?.response?.data?.message ?? "Failed to load the upload log.";
    }
  } finally {
    loading.value = false;
  }
}

onMounted(fetchLog);
</script>
