<template>
  <div class="space-y-3">
    <div
      v-if="props.loading"
      class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
    >
      Loading workflows...
    </div>

    <div
      v-else-if="!props.workflows || props.workflows.length === 0"
      class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
    >
      No workflows associated with this dataset.
    </div>

    <div v-else class="space-y-2">
      <Collapsible
        v-for="workflow in props.workflows"
        :key="workflow.id"
        v-model="workflow.collapse_model"
      >
        <template #header-content>
          <WorkflowCompact :workflow="workflow" />
        </template>
        <div class="mt-2">
          <Workflow :workflow="workflow" />
        </div>
      </Collapsible>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  workflows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});
</script>
