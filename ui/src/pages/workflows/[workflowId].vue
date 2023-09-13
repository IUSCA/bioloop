<template>
  <!-- <WorkflowLogs process-id="16" :live="false" /> -->
  <StepProcesses :workflow-id="props.workflowId" step-name="download" />
</template>

<script setup>
// import workflowService from "@/services/workflow";

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
