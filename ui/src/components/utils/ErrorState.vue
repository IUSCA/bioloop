<template>
  <!--
    `data-testid` is the end-to-end suite's hook for "this surface refused". It is on the
    shared component rather than on each page because every v2 surface renders its refusal
    through this one, and a per-page hook would drift.
    @see docs/design/groups/implementation/e2e-test-plan.md — Selectors
  -->
  <div
    data-testid="error-state"
    class="flex flex-col items-center justify-center gap-4 text-center"
  >
    <div
      class="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30"
    >
      <i-mdi-alert-circle class="text-3xl text-red-600 dark:text-red-400" />
    </div>

    <div class="flex flex-col items-center gap-1 max-w-md">
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        {{ heading }}
      </h3>
      <p
        v-if="detail"
        class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed"
      >
        {{ detail }}
      </p>
    </div>

    <button
      v-if="props.showRetry"
      type="button"
      class="focus-ring inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-white dark:bg-gray-800 border border-solid border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 shadow-sm"
      @click="emit('retry')"
    >
      <i-mdi-refresh class="text-base" />
      {{ props.retryLabel }}
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";

/**
 * A refusal is not a broken page, and it must not confirm that the resource exists.
 * Passing an axios error's own `message` through said both of the wrong things: a caller
 * with no standing on a group read "Failed to load group. Request failed with status code
 * 403", which looks like an outage and tells them the group is there.
 *
 * So when `error` is supplied this component decides the wording from the status, and the
 * caller's `title` and `message` are the fallback for everything that is not a refusal.
 * `error.message` is never shown.
 *
 * @see docs/design/groups/implementation/profiles.md — API
 */
const props = defineProps({
  /** The raw error, if there is one. Its status picks the refusal wording. */
  error: {
    type: [Object, Error],
    default: null,
  },
  /**
   * The noun phrase for what could not be loaded — "this group", "these collections" —
   * used in the refusal wording. Written out by the caller so singular and plural both
   * read correctly.
   */
  subject: {
    type: String,
    default: "this page",
  },
  /** Heading shown above the message. The fallback when `error` is not a refusal. */
  title: {
    type: String,
    default: "Something went wrong",
  },
  /** Detailed error message passed in from the parent. Never an error's own message. */
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

const status = computed(
  () => props.error?.response?.status ?? props.error?.status ?? null,
);

const refusal = computed(() => {
  if (status.value === 401) {
    return {
      heading: "Your session has ended",
      detail: "Sign in again to continue.",
    };
  }
  // 403 and 404 read the same on purpose. A refusal that distinguishes "you may not" from
  // "no such thing" confirms the resource exists to someone who cannot see it.
  if (status.value === 403 || status.value === 404) {
    return {
      heading: `You do not have access to ${props.subject}`,
      detail: "Ask an administrator of the owning group for access.",
    };
  }
  return null;
});

const heading = computed(() => refusal.value?.heading ?? props.title);
// The API's own `message` is written for a person and is worth showing. `error.message`
// is axios's "Request failed with status code 403" and is never shown.
const apiMessage = computed(() => props.error?.response?.data?.message ?? "");

// `message` defaults to "", so this has to fall through on falsy rather than on nullish.
const detail = computed(
  () => refusal.value?.detail || props.message || apiMessage.value,
);
</script>
