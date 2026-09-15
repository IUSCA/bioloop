<template>
  <div
    class="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"
  >
    <Icon
      icon="mdi-card-account-details-outline"
      class="text-2xl shrink-0"
      style="color: var(--va-secondary)"
    />
    <div class="flex-1 min-w-0">
      <p class="text-xs-plus font-semibold">
        This {{ props.kind }} has no profile yet
      </p>
      <!-- The second sentence is addressed to whoever would write one, so a reader who
           cannot write gets the fact alone. -->
      <p
        v-if="props.canWrite"
        class="text-xs mt-0.5"
        style="color: var(--va-secondary)"
      >
        A profile says what the {{ props.kind }} does and where to find it. It
        stays private until you publish it.
      </p>
    </div>
    <VaButton v-if="props.canWrite" class="shrink-0" @click="emit('write')">
      Write a profile
    </VaButton>
  </div>
</template>

<script setup>
/**
 * The strip shown in place of a profile that nobody has written.
 *
 * It is a strip rather than a centred block because an empty profile should not occupy the
 * height a written one would.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  /** "group" or "collection" — read into the two sentences. */
  kind: { type: String, default: "group" },
  canWrite: { type: Boolean, default: false },
});

const emit = defineEmits(["write"]);
</script>
