<template>
  <component
    :is="props.to ? 'RouterLink' : 'div'"
    :to="props.to || undefined"
    class="dash-row flex items-center gap-3 px-3 py-2.5 rounded-lg border border-solid border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors"
    :class="props.to ? 'hover:border-blue-400 dark:hover:border-blue-500' : ''"
  >
    <div v-if="slots.leading || props.icon" class="shrink-0 flex items-center">
      <slot name="leading">
        <Icon
          :icon="props.icon"
          class="text-xl text-gray-400 dark:text-gray-500"
        />
      </slot>
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium truncate">{{ props.title }}</p>
      <p v-if="props.subtitle" class="text-xs va-text-secondary truncate">
        {{ props.subtitle }}
      </p>
    </div>

    <div v-if="slots.right" class="flex items-center gap-2 shrink-0">
      <slot name="right" />
    </div>
  </component>
</template>

<script setup>
/**
 * DashboardListRow
 *
 * Purpose:
 * One compact row inside a dashboard panel: an optional icon, a title, a subtitle, and
 * a trailing slot for badges or a timestamp.
 *
 * Why it exists:
 * The dashboard stacks several panels on one screen, and each holds three to five rows
 * of groups, datasets, or alerts. A full resource card is too tall to read a stack of
 * panels at a glance, and the same compact row was otherwise going to be written out in
 * five places.
 *
 * A row that names a destination renders as a `RouterLink`, so it is reachable by
 * keyboard and can be opened in a new tab.
 *
 * Responsibilities:
 * - Own the compact row's surface, spacing, and truncation.
 *
 * Not responsible for:
 * - What the badges mean. The caller passes them through the `right` slot.
 * - The leading mark. `icon` draws a plain glyph; the `leading` slot takes a component
 *   such as `GroupIcon`, which carries the group-type identity color.
 *
 * @see docs/design/groups/dashboard-plan.md - Phase 2
 * @see docs/contributing/v2-design-system.md - Accessibility floor
 */
import { useSlots } from "vue";

const props = defineProps({
  title: { type: String, required: true },
  /** One line of context under the title. */
  subtitle: { type: String, default: "" },
  /** Iconify name for the leading icon. Omit to draw none. */
  icon: { type: String, default: "" },
  /** Route this row opens. Omit for a row that is not navigable. */
  to: { type: String, default: "" },
});

const slots = useSlots();
</script>

<style scoped>
/* The row can be a router link, so the global anchor rule in main.css would paint the
 * whole row in the primary color and underline it on hover. */
.dash-row,
.dash-row:hover {
  color: inherit;
  text-decoration: none;
}
</style>
