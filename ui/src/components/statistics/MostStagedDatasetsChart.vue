<template>
  <div class="flex flex-col gap-5">
    <div>
      <!-- ECharts BarChart Component -->
      <v-chart
        v-if="!isLoading && !isNoData"
        class="chart"
        :option="chartOptions"
        autoresize
        @click="onChartClick"
      />
      <!-- <div v-else class="loading-message">Loading chart data...</div> -->
      <div
        v-else-if="isLoading"
        class="flex items-center justify-center"
        style="height: 500px; width: 100%; font-size: 24px"
      >
        Loading...
      </div>
      <!-- Display 'No Data Found' if no data is fetched -->
      <div
        v-else
        class="flex justify-center items-center"
        style="height: 500px; font-size: 24px"
      >
        No Data Found
      </div>
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
const isLoading = ref(false); // Flag to indicate if data has been loaded
const isNoData = ref(false); // Track if data is empty

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
  isLoading.value = true; // Set loading to true when starting the fetch
  isNoData.value = false; // Reset noData state before fetching data
  StatisticsService.getMostStagedDatasets(numberOfEntriesRetrieved.value)
    .then((res) => {
      //console.log(res.data);
      chartData.value = formatChartStatistics(res.data);
      if (
        !chartData.value.datasets.length ||
        !chartData.value.counts.length ||
        !chartData.value.ids.length
      ) {
        isNoData.value = true; // Set no data found
      } else {
        isNoData.value = false; // Data found
      }
    })
    .catch((err) => {
      console.log("Unable to retrieve dataset count", err);
      toast.error("Unable to retrieve dataset count");
    })
    .finally(() => {
      isLoading.value = false; // Set loading to false after fetch completes
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
    data: chartData.value.datasets.map((dataset) =>
      dataset.length > 15 ? `${dataset.slice(0, 10)}...` : dataset,
    ),
    inverse: true,
    axisLabel: {
      formatter: (value) => value, // This ensures the modified usernames are displayed correctly
    },
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
/* .loading-message {
  text-align: center;
  font-size: 16px;
  color: gray;
} */
</style>
