<template>
  <va-inner-loading :loading="loading">
      <!-- v-if="actionItem && ingestionChecks.length > 0" -->
      <!-- :loading-resources="loading" -->
    <action-item-report
      v-if="!loading"
      :action-item="actionItem"
      :ingestion-checks="ingestionChecks"
      :dataset-workflows="datasetWorkflows"
      @initiated-resolution="fetchActionItemDetails"
    />
  </va-inner-loading>
</template>

<script setup>
import ActionItemReport from "@/components/dataset/actionItems/duplication/index.vue";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";

const props = defineProps({
  actionItemId: {
    type: String,
    required: true,
  },
});

const datasetWorkflows = ref([]);
const actionItem = ref(null);
const ingestionChecks = ref([]);
const loading = ref(false);

const fetchDatasetIngestionChecks = (dataset_id) => {
  return datasetService
   .getById({
      id: dataset_id,
      include_ingestion_checks: true
    })
   .then((res) => {
      ingestionChecks.value = res.data.ingestion_checks  
      console.log("Dataset ingestion checks:", res.data.ingestion_checks);
    })
   .catch((err) => {
      toast.error("Failed to fetch dataset ingestion checks");
      console.error(err);
    });
}

const fetchActionItemDetails = () => {
  return datasetService
    .getActionItem({ action_item_id: props.actionItemId })
    .then((res) => {
      console.log("Action item details:", res.data);
      actionItem.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch action item details");
      console.error(err);
    });
};

const fetchDatasetWorkflows = (dataset_id) => {
  return datasetService
    .getWorkflows({
      dataset_id,
      statuses: ["PENDING", "STARTED", "FAILURE"],
    })
    .then((res) => {
      datasetWorkflows.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch dataset workflows");
      console.error(err);
    });
};

const fetchResources = () => {
  loading.value = true;
  // console.log("loading = true")

  let originalDatasetId, duplicateDatasetId;

  fetchActionItemDetails().then(() => {
    originalDatasetId = actionItem.value.dataset.duplicated_from.original_dataset_id;
    duplicateDatasetId = actionItem.value.dataset.duplicated_from.duplicate_dataset_id;
    return true
  }).then(() => {
    return fetchDatasetWorkflows(originalDatasetId);
  }).then(() => {
    return fetchDatasetIngestionChecks(duplicateDatasetId);
  }).catch((err) => {
    toast.error("Failed to fetch resources");
    console.error(err);
  }).finally(() => {
    loading.value = false;
    console.log("loading = false")
  })

  // await fetchActionItemDetails();
  // // const originalDatasetId = actionItem.value.dataset.duplicated_from.original_dataset_id;
  // // const duplicateDatasetId = actionItem.value.dataset.duplicated_from.duplicate_dataset_id;
  // await fetchDatasetWorkflows(
  //   originalDatasetId
  // );
  // await fetchDatasetIngestionChecks(duplicateDatasetId);
  // loading.value = false;
  // console.log("loading = false")
};

onMounted(() => {
  console.log("[actionItemId] mounted")
  fetchResources();
});
</script>

<route lang="yaml">
meta:
  title: Resolve Duplicate
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Duplicate Datasets" }, { label: "Resolve Duplicate" }]
</route>
