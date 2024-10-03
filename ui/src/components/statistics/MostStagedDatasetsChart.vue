<template>
  <div class="flex flex-col gap-5">
    <div>
      <!-- ECharts BarChart Component -->
      <v-chart
        v-if="isDataAvailable"
        class="chart"
        :option="chartOptions"
        autoresize
        @click="onChartClick"
      />
      <div v-else class="loading-message">Loading chart data...</div>
    </div>
    <div class="flex flex-row justify-center">
      <div class="max-w-max most-staged-datasets-chart-select-container">
        <span>Showing top&nbsp;&nbsp;&nbsp;</span>
        <va-select
          class="w-20"
          :options="dropdownOptions"
          v-model="numberOfEntriesRetrieved"
        />
        <span>&nbsp;&nbsp;&nbsp;staged datasets</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import StatisticsService from "@/services/statistics";
import toast from "@/services/toast";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, onMounted, ref, watch } from "vue";
import VChart from "vue-echarts";

// Register ECharts components
use([
  CanvasRenderer,
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  VisualMapComponent,
]);

// Default initialization to avoid undefined data
const chartData = ref({ datasets: [], counts: [], ids: [] }); // Added ids array
const isDataAvailable = ref(false); // Flag to indicate if data has been loaded

const dropdownOptions = [10, 20];
const numberOfEntriesRetrieved = ref(dropdownOptions[0]);

// Function to retrieve and format data for ECharts
const formatChartStatistics = (dataset_stats) => {
  return {
    datasets: dataset_stats.map((stat) => stat.dataset_name),
    counts: dataset_stats.map((stat) => stat.count),
    ids: dataset_stats.map((stat) => stat.dataset_id), // Add dataset_id to the return object
  };
};

// Fetch data from backend and update chart
const retrieveAndConfigureChartData = () => {
  isDataAvailable.value = false; // Set flag to false while data is loading
  StatisticsService.getMostStagedDatasets(numberOfEntriesRetrieved.value)
    .then((res) => {
      //console.log(res.data);
      chartData.value = formatChartStatistics(res.data);
      isDataAvailable.value = true; // Set flag to true when data is ready
    })
    .catch((err) => {
      console.log("Unable to retrieve dataset count", err);
      toast.error("Unable to retrieve dataset count");
    });
};

// Add the click event listener on the chart component
const onChartClick = (params) => {
  if (params.componentType === "series") {
    const datasetId = chartData.value.ids[params.dataIndex]; // Get dataset_id using dataIndex
    if (datasetId) {
      // Navigate to the dataset page using the dataset_id
      window.location.href = `/datasets/${datasetId}`; // Use relative path for navigation
    }
  }
};

// Watch for dropdown change and fetch new data
watch(numberOfEntriesRetrieved, () => {
  retrieveAndConfigureChartData();
});

// Initial fetch when component is mounted
onMounted(() => {
  retrieveAndConfigureChartData();
});

// Computed chart options for ECharts
const chartOptions = computed(() => ({
  title: {
    text: "Most Frequently Staged Datasets",
    left: "center",
    textStyle: {
      fontSize: 18,
      fontWeight: "bold",
    },
  },
  grid: { containLabel: true },
  xAxis: {
    type: "value",
    name: "Count",
    nameLocation: "middle",
    nameGap: 30,
    nameTextStyle: {
      fontSize: 16, // Increase font size
      fontWeight: "bold", // Make it bold
    },
  },
  yAxis: {
    type: "category",
    name: "Dataset Name",
    nameLocation: "middle",
    nameGap: 230,
    nameTextStyle: {
      fontSize: 16, // Increase font size
      fontWeight: "bold", // Make it bold
    },
    data: chartData.value.datasets,
    inverse: true,
  },
  tooltip: {
    trigger: "item",
    formatter: (params) => {
      const { value, dataIndex } = params;
      const dataset = chartData.value.datasets[dataIndex];
      return `<strong>Dataset:</strong> ${dataset}<br><strong>Count:</strong> ${value}`;
    },
  },
  visualMap: {
    orient: "horizontal",
    left: "center",
    min: Math.min(...chartData.value.counts),
    max: Math.max(...chartData.value.counts),
    text: ["High Count", "Low Count"],
    dimension: 0,
    inRange: {
      color: ["#65B581", "#FFCE34", "#FD665F"],
    },
  },
  series: [
    {
      type: "bar",
      data: chartData.value.counts,
      itemStyle: {
        color: function (params) {
          return params.color;
        },
      },
    },
  ],
}));
</script>

<style scoped>
.chart {
  height: 500px; /* Adjust height as necessary */
}
.most-staged-datasets-chart-select-container {
  margin-top: 12px;
}
.loading-message {
  text-align: center;
  font-size: 16px;
  color: gray;
}
</style>
