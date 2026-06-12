<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      v-for="card in cards"
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
import MetricCard from "@/components/v2/MetricCard.vue";

const { cards } = defineProps({
  /**
   * @type Array<{ label: string, value: number|string|null, loading?: boolean, icon: string, color?: string }>
   */
  cards: { type: Array, default: () => [] },
});
</script>
