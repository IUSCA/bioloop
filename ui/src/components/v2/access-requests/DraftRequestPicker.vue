<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2 mb-2">
      <Icon
        icon="mdi-clipboard-outline"
        class="text-xl text-gray-600 dark:text-gray-400"
      />
      <h3 class="text-base font-medium text-gray-900 dark:text-gray-100">
        You have existing drafts
      </h3>
    </div>

    <!-- List of drafts -->
    <div class="space-y-2 max-h-96 overflow-y-auto">
      <button
        v-for="draft in props.drafts"
        :key="draft.id"
        @click="$emit('select', draft.id)"
        class="w-full px-4 py-3 rounded-lg border border-solid border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
      >
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
            >
              {{ getSubjectName(draft) }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {{ formatItemCount(draft.access_request_items?.length) }}
            </p>
          </div>
          <div
            class="flex-shrink-0 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatUpdatedTime(draft.updated_at) }}
          </div>
        </div>
        <div class="flex items-center justify-end">
          <span
            class="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1"
          >
            Continue
            <i-mdi-arrow-right class="text-sm" />
          </span>
        </div>
      </button>
    </div>

    <!-- Divider -->
    <div class="flex items-center gap-2 my-2">
      <div class="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
      <span class="text-xs text-gray-400 dark:text-gray-500">or</span>
      <div class="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
    </div>

    <!-- Start new request -->
    <button
      @click="$emit('create-new')"
      class="w-full px-4 py-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-all text-center"
    >
      <div class="flex items-center justify-center gap-2">
        <i-mdi-plus class="text-base text-gray-600 dark:text-gray-400" />
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Start a new request
        </span>
      </div>
    </button>
  </div>
</template>

<script setup>
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const props = defineProps({
  drafts: {
    type: Array,
    required: true,
  },
});

defineEmits(["select", "create-new"]);

/**
 * Get subject name from draft
 */
function getSubjectName(draft) {
  if (draft.subject?.user?.name) {
    return draft.subject.user.name;
  }
  if (draft.subject?.group?.name) {
    return draft.subject.group.name;
  }
  return "Unknown subject";
}

/**
 * Format item count
 */
function formatItemCount(count) {
  if (!count || count === 0) {
    return "No items selected yet";
  }
  if (count === 1) {
    return "1 access item";
  }
  return `${count} access items`;
}

/**
 * Format updated time
 */
function formatUpdatedTime(timestamp) {
  return dayjs(timestamp).fromNow();
}
</script>
