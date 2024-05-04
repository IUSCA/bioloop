<template>
  <action-item-report
    v-if="actionItem"
    :loading-resources="loading"
    :action-item="actionItem"
    :dataset-workflows="datasetWorkflows"
    @initiated-resolution="fetchActionItemDetails"
  />
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
const loading = ref(false);

const fetchActionItemDetails = () => {
  return datasetService
    .getActionItem({ action_item_id: props.actionItemId })
    .then((res) => {
      actionItem.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch action item details");
      toast.error(err);
    });
};

const fetchDatasetWorkflows = (dataset_id) => {
  return datasetService
    .getWorkflows({
      dataset_id,
      params: {
        status: ["PENDING", "STARTED", "FAILURE"],
      },
    })
    .then((res) => {
      datasetWorkflows.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch dataset workflows");
      toast.error(err);
    });
};

const fetchResources = async () => {
  loading.value = true;
  await fetchActionItemDetails();
  await fetchDatasetWorkflows(actionItem.value.dataset_id);
  loading.value = false;
};

onMounted(() => {
  fetchResources();
});
</script>

<route lang="yaml">
meta:
  title: Resolve Duplicate
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Duplicate Datasets" }, { label: "Resolve Duplicate" }]
</route>
