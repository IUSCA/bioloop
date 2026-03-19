<template>
  <div class="flex flex-col items-center justify-center gap-4 text-center">
    <div class="flex items-center justify-center w-16 h-16 rounded-full">
      <i-mdi-magnify class="text-5xl text-gray-400 dark:text-gray-500" />
    </div>

    <div class="flex flex-col items-center gap-1 max-w-sm">
      <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {{ props.title }}
      </p>
      <p
        v-if="props.message"
        class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed"
      >
        {{ props.message }}
      </p>
    </div>

    <button
      v-if="props.showClearFilters"
      class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900 transition-colors duration-150 shadow-sm"
      @click="emit('reset')"
    >
      <i-mdi-filter-remove-outline class="text-base" />
      {{ props.clearFiltersLabel }}
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  /** Heading shown above the message */
  title: {
    type: String,
    default: "No results found",
  },
  /** Supplementary message describing what to try */
  message: {
    type: String,
    default:
      "Try adjusting your search or filters to find what you're looking for.",
  },
  /** Show or hide the clear-filters button */
  showClearFilters: {
    type: Boolean,
    default: true,
  },
  /** Label for the clear-filters button */
  clearFiltersLabel: {
    type: String,
    default: "Clear filters",
  },
});

const emit = defineEmits(["reset"]);
</script>
