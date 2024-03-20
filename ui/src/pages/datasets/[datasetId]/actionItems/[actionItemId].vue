<template>
  <action-item-report
    v-if="actionItem"
    :loading-resources="loading"
    :action-item="actionItem"
    @initiated-resolution="fetchActionItemDetails"
  />
</template>

<script setup>
import ActionItemReport from "@/components/dataset/actionItems/datasetDiffReport/index.vue";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";

const props = defineProps({
  actionItemId: {
    type: String,
    required: true,
  },
});

const actionItem = ref(null);
const loading = ref(false);

const fetchActionItemDetails = () => {
  loading.value = true;
  return datasetService
    .getActionItem({ action_item_id: props.actionItemId })
    .then((res) => {
      actionItem.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch action item details");
      toast.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
};

onMounted(() => {
  fetchActionItemDetails();
});
</script>

<route lang="yaml">
meta:
  title: Resolve Duplicate
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Duplicate Datasets" }, { label: "Resolve Duplicate" }]
</route>
