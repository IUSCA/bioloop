<template>
  <div v-if="!_.isEmpty(props.chartData)">
    <Pie
      :class="props.centeredHorizontallyInContainer && 'mr-auto ml-auto'"
      :data="props.chartData"
      :options="props.chartOptions"
    ></Pie>
  </div>
</template>

<script setup>
import { Pie } from "vue-chartjs";
import _ from "lodash";

const props = defineProps({
  chartData: Object,
  chartOptions: Object,
  centeredHorizontallyInContainer: { Boolean, default: () => true },
});
</script>
