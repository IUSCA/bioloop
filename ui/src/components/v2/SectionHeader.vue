<template>
  <div class="flex items-center gap-2">
    <Icon :icon="props.icon" class="text-xl" style="color: var(--va-primary)" />
    <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">{{ props.title }}</h2>
  </div>
</template>

<script setup>
const props = defineProps({
  /** MDI icon name, e.g. "mdi-account-group-outline" */
  icon: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
})
</script>
