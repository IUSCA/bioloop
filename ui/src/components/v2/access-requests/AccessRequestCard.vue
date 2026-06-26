<template>
  <div
    class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
          {{ request?.title || "Access Request" }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Status: {{ request?.status || "Unknown" }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  request: {
    type: Object,
    required: true,
  },
});
</script>
