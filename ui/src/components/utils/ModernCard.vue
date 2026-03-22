<template>
  <div
    class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-900/30 shadow-sm"
  >
    <div
      class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-4 pt-4 pb-2 border-solid"
    >
      <Icon
        :icon="props.icon"
        v-if="props.icon"
        class="text-gray-600 dark:text-gray-400"
      />
      <h3
        class="text-sm font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100"
      >
        <slot name="title"> {{ props.title }} </slot>
      </h3>
    </div>

    <div class="p-4">
      <slot />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  icon: String,
  title: String,
});
</script>
