<template>
  <div
    class="flex flex-col justify-center px-4 py-3 min-w-[132px] border-0 border-l border-solid border-gray-100 dark:border-gray-800 first:border-l-0"
  >
    <span
      class="text-2xs font-semibold uppercase tracking-wide mb-1"
      style="color: var(--va-secondary)"
    >
      {{ props.label }}
    </span>
    <span class="flex items-center gap-1.5 text-xs-plus font-medium min-w-0">
      <slot />
    </span>
  </div>
</template>

<script setup>
/**
 * One labelled cell in an OverviewBand's facts row.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  label: { type: String, required: true },
});
</script>
