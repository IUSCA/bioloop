<template>
  <label
    class="flex items-start justify-start gap-3 rounded-md border border-solid px-3.5 py-4 cursor-pointer"
    :class="
      model
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    "
  >
    <VaSwitch
      v-model="model"
      size="small"
      color="success"
      class="shrink-0 switch"
      @input="emit('input', model)"
    />
    <div class="flex flex-col gap-1">
      <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
        Allow member contributions
      </div>
      <div class="text-xs text-gray-600 dark:text-gray-400">
        Group members can upload datasets owned by this group. The group
        maintains ownership of contributed datasets—contributors do not own the
        data they upload.
      </div>
    </div>
  </label>
</template>

<script setup>
const model = defineModel();
const emit = defineEmits(["input"]);
</script>

<style scoped>
.switch {
  --va-switch-track-box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.75);
}
</style>
