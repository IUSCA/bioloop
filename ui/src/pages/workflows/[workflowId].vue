<template>
  <div>Workflow: {{ props.workflowId }}</div>

  <WorkflowLogs :workflow-id="props.workflowId" />
</template>

<script setup>
const props = defineProps({
  workflowId: {
    type: String,
  },
});
</script>

<route lang="yaml">
meta:
  title: Workflow Details
  requiresRoles: ["operator", "admin"]
</route>
