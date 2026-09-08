<template>
  <div class="flex flex-col items-center justify-center gap-4 text-center">
    <div class="flex items-center justify-center w-16 h-16 rounded-full">
      <Icon
        :icon="props.icon"
        class="text-5xl text-gray-400 dark:text-gray-500"
      />
    </div>

    <div class="flex flex-col items-center gap-1 max-w-md">
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        {{ props.title }}
      </h3>
      <p
        v-if="hasMessage"
        class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
      >
        <slot name="message">{{ props.message }}</slot>
      </p>
    </div>

    <div v-if="slots.actions" class="flex items-center gap-3">
      <slot name="actions" />
    </div>

    <button
      v-else-if="props.showClearFilters"
      type="button"
      class="focus-ring inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-white dark:bg-gray-800 border border-solid border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 shadow-sm"
      @click="emit('reset')"
    >
      <i-mdi-filter-remove-outline class="text-base" />
      {{ props.clearFiltersLabel }}
    </button>
  </div>
</template>

<script setup>
/**
 * EmptyState
 *
 * Purpose:
 * The centered block a list region shows when it has nothing to display: an icon, a
 * title, an explanation, and either a call to action or a clear-filters button.
 *
 * Why it exists:
 * "Nothing here" has two quite different meanings — the filters excluded everything, or
 * the resource genuinely has none — and the second usually comes with an invitation to
 * create the first one. Both were being written by hand in every list and tab, which is
 * how they drifted into a dozen heading sizes and three icon treatments.
 *
 * Responsibilities:
 * - Own the layout, icon treatment, and typography of an empty region.
 * - Offer the clear-filters affordance for the filtered case, and an `actions` slot for
 *   the create-the-first-one case.
 *
 * Not responsible for:
 * - Deciding which of the two cases applies. The caller knows whether filters are active.
 * - Failures. Use `ErrorState` when a fetch rejected.
 *
 * @see docs/contributing/v2-design-system.md - The page shell
 */
import { computed, useSlots } from "vue";

const props = defineProps({
  /** Heading shown above the message. */
  title: {
    type: String,
    default: "No results found",
  },
  /** Supplementary message. The `message` slot takes precedence when both are given. */
  message: {
    type: String,
    default:
      "Try adjusting your search or filters to find what you're looking for.",
  },
  /** Iconify name for the illustration above the title. */
  icon: {
    type: String,
    default: "mdi-magnify",
  },
  /** Show the clear-filters button. Ignored when the `actions` slot is filled. */
  showClearFilters: {
    type: Boolean,
    default: true,
  },
  /** Label for the clear-filters button. */
  clearFiltersLabel: {
    type: String,
    default: "Clear filters",
  },
});

const emit = defineEmits(["reset"]);

const slots = useSlots();

const hasMessage = computed(() => !!slots.message || !!props.message);
</script>
