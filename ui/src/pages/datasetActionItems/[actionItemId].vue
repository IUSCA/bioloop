<template>
  <va-inner-loading :loading="loading">
    <action-item-report v-if="actionItem" :report="actionItem" />
  </va-inner-loading>
</template>

<script setup>
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import ActionItemReport from "@/components/dataset/actionItems/report/index.vue";

const props = defineProps({
  actionItemId: {
    type: String,
    required: true,
  },
});

const loading = ref(false);
const actionItem = ref(null);

const fetchActionItemDetails = (actionItemId) => {
  loading.value = true;
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
      loading.value = false;
    });
};

onMounted(() => {
  fetchActionItemDetails(props.actionItemId);
});
</script>

<style scoped></style>
