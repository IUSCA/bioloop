<template>
  <div
    v-if="props.items.length"
    class="grid gap-4"
    :class="props.items.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'"
  >
    <button
      v-for="item in props.items"
      :key="item.label"
      type="button"
      class="flex items-center gap-3 px-4 py-3 rounded-lg text-left cursor-pointer border border-solid border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700"
      @click="item.onClick"
    >
      <span
        class="w-8 h-8 shrink-0 rounded-md flex items-center justify-center bg-amber-100 dark:bg-amber-900/40"
      >
        <Icon
          :icon="item.icon"
          class="text-base text-amber-700 dark:text-amber-400"
        />
      </span>
      <span class="text-sm min-w-0 text-amber-900 dark:text-amber-200">
        <span class="font-bold">{{ item.count }}</span>
        {{ item.label }}
      </span>
      <i-mdi-chevron-right
        class="ml-auto shrink-0 text-amber-600 dark:text-amber-500"
      />
    </button>
  </div>
</template>

<script setup>
/**
 * The row of things waiting on the caller, above everything else in an Overview tab's wide
 * column.
 *
 * A caller who has nothing waiting gets no row at all. A row reading "0 requests to review"
 * would take the best position on the page to say nothing.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  /** [{ icon, count, label, onClick }] — already filtered to non-zero counts. */
  items: { type: Array, default: () => [] },
});
</script>
