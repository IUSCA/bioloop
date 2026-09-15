<template>
  <VaCard v-if="props.actions.length">
    <VaCardContent>
      <h2 class="v2-card-title mb-2">Quick actions</h2>
      <div class="flex flex-col">
        <template v-for="(action, i) in props.actions" :key="action.label">
          <!-- One rule above the first destructive action, so it reads as a separate
               group rather than as the next item in the list. -->
          <div
            v-if="action.danger && !props.actions[i - 1]?.danger"
            class="my-1.5 border-0 border-t border-solid border-gray-100 dark:border-gray-800"
          ></div>

          <button
            type="button"
            class="flex items-center gap-3 -mx-2 px-2 py-2 rounded-md text-xs-plus font-medium text-left bg-transparent border-0 cursor-pointer"
            :class="
              action.danger
                ? 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300'
            "
            @click="action.onClick"
          >
            <span
              class="w-7 h-7 shrink-0 rounded-md flex items-center justify-center"
              :class="
                action.danger
                  ? 'bg-red-50 dark:bg-red-900/30'
                  : 'bg-blue-50 dark:bg-blue-900/30'
              "
            >
              <Icon
                :icon="action.icon"
                class="text-sm"
                :class="action.danger ? 'text-red-600 dark:text-red-400' : ''"
                :style="action.danger ? null : 'color: var(--va-primary)'"
              />
            </span>
            {{ action.label }}
          </button>
        </template>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The grouped actions panel, first card in an Overview tab's thin column so that being
 * grouped does not cost it the fold.
 *
 * Renders nothing when the caller's permissions leave it empty, rather than an empty card.
 *
 * An action marked `danger` is drawn in red below a rule. Archiving lives there: it has to
 * be findable and hard to hit by accident, and the modal behind it is the real guard.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  /**
   * [{ icon, label, onClick, danger? }] — Iconify names, already filtered by permission.
   * Destructive entries go last; the component draws the rule above the first of them.
   */
  actions: { type: Array, default: () => [] },
});
</script>
