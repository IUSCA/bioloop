<template>
  <div v-if="!_.isEmpty(props.chartData)">
    <Bar
      :class="props.centeredHorizontallyInContainer && 'mr-auto ml-auto'"
      :data="props.chartData"
      :options="props.chartOptions"
    ></Bar>
  </div>
</template>

<script setup>
import _ from "lodash";
import { Bar } from "vue-chartjs";

const props = defineProps({
  chartData: Object,
  chartOptions: Object,
  centeredHorizontallyInContainer: { Boolean, default: () => true },
});
</script>
