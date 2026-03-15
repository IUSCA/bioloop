<template>
  <div class="flex flex-col items-center justify-center gap-4 text-center">
    <div
      class="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30"
    >
      <i-mdi-alert-circle class="text-3xl text-red-600 dark:text-red-400" />
    </div>

    <div class="flex flex-col items-center gap-1 max-w-sm">
      <p class="text-base font-semibold text-gray-900 dark:text-gray-100">
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
      v-if="props.showRetry"
      class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-900 transition-colors duration-150 shadow-sm"
      @click="emit('retry')"
    >
      <i-mdi-refresh class="text-base" />
      {{ props.retryLabel }}
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  /** Heading shown above the message */
  title: {
    type: String,
    default: "Something went wrong",
  },
  /** Detailed error message passed in from the parent */
  message: {
    type: String,
    default: "",
  },
  /** Show or hide the retry button */
  showRetry: {
    type: Boolean,
    default: true,
  },
  /** Label for the retry button */
  retryLabel: {
    type: String,
    default: "Try again",
  },
});

const emit = defineEmits(["retry"]);
</script>
