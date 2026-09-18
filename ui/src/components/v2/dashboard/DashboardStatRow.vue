<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4" :class="columnClass">
    <MetricCard
      v-for="card in props.cards"
      :key="card.label"
      :label="card.label"
      :value="card.value"
      :loading="card.loading"
      :icon="card.icon"
      :color="card.color"
    />
  </div>
</template>

<script setup>
/**
 * DashboardStatRow
 *
 * Purpose:
 * The row of counts under the dashboard hero.
 *
 * Why it exists:
 * The number of cards differs per persona — three for a standard user, four for an
 * admin — so the grid has to follow the data rather than a fixed column count.
 *
 * Responsibilities:
 * - Lay `MetricCard` out at a column count that matches how many cards it was given.
 *
 * Not responsible for:
 * - The cards themselves. `MetricCard` owns the surface, and `home.vue` owns the
 *   queries behind each value.
 *
 * @see docs/design/groups/ui-information-architecture.md — Dashboard
 */
import MetricCard from "@/components/v2/MetricCard.vue";
import { computed } from "vue";

const props = defineProps({
  /**
   * @type Array<{ label: string, value: number|string|null, loading?: boolean,
   *   icon: string, color?: string }>
   */
  cards: { type: Array, default: () => [] },
});

// Written as complete literals, because Tailwind cannot see a class built by
// interpolation and would generate no rule for it.
const COLUMNS = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

const columnClass = computed(
  () => COLUMNS[props.cards.length] ?? "lg:grid-cols-4",
);
</script>
