<template>
  <action-item-report :action-item-id="props.actionItemId" />
</template>

<script setup>
import ActionItemReport from "@/components/dataset/actionItems/datasetDiffReport/index.vue";

const props = defineProps({
  actionItemId: {
    type: String,
    required: true,
  },
});
</script>

<route lang="yaml">
meta:
  title: Resolve Duplicate
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Duplicate Datasets" }, { label: "Resolve Duplicate" }]
</route>
