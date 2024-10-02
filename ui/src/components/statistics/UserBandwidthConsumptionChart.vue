<template>
  <div class="flex flex-col gap-5">
    <div>
      <!-- Render chart only if data is available -->
      <v-chart
        v-if="isDataAvailable"
        class="chart"
        :option="chartOptions"
        autoresize
      />
      <div v-else class="loading-message">Loading chart data...</div>
    </div>
    <div class="flex flex-row justify-center">
      <div class="max-w-max user-bandwidth-chart-select-container">
        <span>Showing top&nbsp;&nbsp;&nbsp;</span>
        <va-select
          class="w-20"
          :options="dropdownOptions"
          v-model="numberOfEntriesRetrieved"
        />
        <span>&nbsp;&nbsp;&nbsp;users by bandwidth consumption</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import StatisticsService from "@/services/statistics";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
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
const chartData = ref({ users: [], bandwidths: [], usernames: [] });
const isDataAvailable = ref(false); // Flag to indicate if data has been loaded

const dropdownOptions = [10, 20];
const numberOfEntriesRetrieved = ref(dropdownOptions[0]);

// Function to retrieve and format data for ECharts
const formatChartStatistics = (user_bandwidth_stats) => {
  return {
    users: user_bandwidth_stats.map((stat) => stat.name),
    bandwidths: user_bandwidth_stats.map((stat) => stat.bandwidth),
    usernames: user_bandwidth_stats.map((stat) => stat.username),
  };
};

// Fetch data from backend and update chart
const retrieveAndConfigureChartData = () => {
  isDataAvailable.value = false; // Set flag to false while data is loading
  StatisticsService.getUsersByBandwidthConsumption(
    numberOfEntriesRetrieved.value,
  )
    .then((res) => {
      chartData.value = formatChartStatistics(res.data);
      isDataAvailable.value = true; // Set flag to true when data is ready
    })
    .catch((err) => {
      console.log("Unable to retrieve user count", err);
      toast.error("Unable to retrieve user count");
    });
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
    text: "Users by Bandwidth Consumption", // Chart title
    left: "center", // Align title to center
    textStyle: {
      fontSize: 18, // Title font size
      fontWeight: "bold",
    },
  },
  grid: { containLabel: true },
  xAxis: {
    type: "value",
    name: "Bandwidth",
    nameLocation: "middle",
    nameGap: 30,
    nameTextStyle: {
      fontSize: 16, // Increase font size
      fontWeight: "bold", // Make it bold
    },
    axisLabel: {
      formatter: (value) => formatBytes(value),
    },
  },
  yAxis: {
    type: "category",
    name: "User",
    nameLocation: "middle",
    nameGap: 120,
    nameTextStyle: {
      fontSize: 16, // Increase font size
      fontWeight: "bold", // Make it bold
    },
    data: chartData.value.users,
    inverse: true, // to match the user consumption descending order
  },
  tooltip: {
    trigger: "item",
    formatter: (params) => {
      const { value, dataIndex } = params;
      const bandwidth = formatBytes(value);
      const username = chartData.value.usernames[dataIndex];
      return `<strong>User:</strong> ${username}<br><strong>Bandwidth:</strong> ${bandwidth}`;
    },
  },
  visualMap: {
    orient: "horizontal",
    left: "center",
    min: Math.min(...chartData.value.bandwidths),
    max: Math.max(...chartData.value.bandwidths),
    text: ["High Bandwidth", "Low Bandwidth"],
    dimension: 0,
    inRange: {
      color: ["#65B581", "#FFCE34", "#FD665F"],
    },
  },
  series: [
    {
      type: "bar",
      data: chartData.value.bandwidths,
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
.user-bandwidth-chart-select-container {
  margin-top: 12px;
}
.loading-message {
  text-align: center;
  font-size: 16px;
  color: gray;
}
</style>
