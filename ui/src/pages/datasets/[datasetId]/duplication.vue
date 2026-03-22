<template>
  <va-alert
    v-if="!featureEnabled"
    color="warning"
    icon="info"
    data-testid="duplication-feature-disabled-alert"
  >
    Duplicate detection is not enabled on this instance.
  </va-alert>

  <va-inner-loading v-else :loading="loading">
    <duplication-resolution
      v-if="!loading && dataset"
      :dataset="dataset"
      :duplication="duplication"
      :ingestion-checks="ingestionChecks"
      :original-dataset="originalDataset"
      @resolution-complete="fetchReport"
    />
    <va-alert
      v-if="!loading && !dataset"
      color="danger"
      icon="error"
    >
      Could not load duplication report for this dataset.
    </va-alert>
  </va-inner-loading>
</template>

<script setup>
import DuplicationResolution from "@/components/dataset/actionItems/duplication/index.vue";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const featureEnabled = auth.isFeatureEnabled('duplicate_detection');

const props = defineProps({
  datasetId: {
    type: String,
    required: true,
  },
});

const loading = ref(false);
const dataset = ref(null);
const duplication = ref(null);
const ingestionChecks = ref([]);
const originalDataset = ref(null);

const fetchReport = async () => {
  loading.value = true;
  try {
    const res = await datasetService.getDuplicationReport({
      dataset_id: props.datasetId,
    });
    dataset.value = res.data;
    duplication.value = res.data.duplicated_from || null;
    ingestionChecks.value = res.data.ingestion_checks || [];

    if (duplication.value?.original_dataset_id) {
      const origRes = await datasetService.getById({
        id: duplication.value.original_dataset_id,
        workflows: false,
        include_states: true,
      });
      originalDataset.value = origRes.data;
    }
  } catch (err) {
    toast.error("Failed to load duplication report");
    console.error(err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (featureEnabled) fetchReport();
});
</script>

<route lang="yaml">
meta:
  title: Duplication Report
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Datasets" }, { label: "Duplication Report" }]
</route>
