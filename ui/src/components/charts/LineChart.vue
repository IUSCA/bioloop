<template>
  <div v-if="!_.isEmpty(props.chartData)" class="line-chart-container">
    <Line
      :class="props.centeredHorizontallyInContainer && 'mr-auto ml-auto'"
      :data="props.chartData"
      :options="props.chartOptions"
    />
  </div>
</template>

<script setup>
import _ from "lodash";
import { Line } from "vue-chartjs";

const props = defineProps({
  chartData: Object,
  chartOptions: Object,
  centeredHorizontallyInContainer: { Boolean, default: () => true },
});
</script>
