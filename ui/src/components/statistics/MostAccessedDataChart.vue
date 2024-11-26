<template>
  <div class="flex flex-col gap-5">
    <div>
      <!-- Render the bar chart -->
      <v-chart
        v-if="!isLoading && !isNoData"
        class="chart"
        :option="chartOptions"
        autoresize
        @click="onChartClick"
      />
      <!-- <div v-else class="loading-message">Loading...</div> -->
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
      <div class="max-w-max most-accessed-chart-select-container">
        <span>Showing top&nbsp;&nbsp;&nbsp;</span>
        <va-select
          class="w-20"
          :options="dropdownOptions"
          v-model="numberOfEntriesRetrieved"
        />
        <span>&nbsp;&nbsp;&nbsp;accessed files/datasets</span>
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
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
]);

// Reactive variables
const chartData = ref({ names: [], counts: [], ids: [] });
const isLoading = ref(false);
const isNoData = ref(false); // Track if data is empty

const dropdownOptions = [10, 20];
const numberOfEntriesRetrieved = ref(dropdownOptions[0]);

// Function to fetch and configure chart data
const configureChartData = (most_accessed_stats) => {
  return {
    names: most_accessed_stats.map((stat) => stat.name),
    counts: most_accessed_stats.map((stat) => stat.count),
    ids: most_accessed_stats.map((stat) => stat.dataset_id), // Add dataset_id to the return object
  };
};

const retrieveAndConfigureChartData = () => {
  isLoading.value = true; // Set flag to false while loading data
  isNoData.value = false; // Reset noData state before fetching data
  StatisticsService.getMostAccessedData(numberOfEntriesRetrieved.value, true)
    .then((res) => {
      // console.log(res.data);
      chartData.value = configureChartData(res.data);
      if (
        !chartData.value.names.length ||
        !chartData.value.counts.length ||
        !chartData.value.ids.length
      ) {
        isNoData.value = true; // Set no data found
      } else {
        isNoData.value = false; // Data found
      }
    })
    .catch((err) => {
      console.log("Unable to retrieve most accessed files", err);
      toast.error("Unable to retrieve most accessed files");
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

// Watcher to handle dropdown selection change
watch(numberOfEntriesRetrieved, () => {
  retrieveAndConfigureChartData();
});

// Initial data fetch when component is mounted
onMounted(() => {
  retrieveAndConfigureChartData();
});

// Computed property for chart options
const chartOptions = computed(() => ({
  title: {
    text: "Most Frequently Accessed Files/Datasets",
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
    nameGap: 30, // Gap between axis name and axis line
    nameTextStyle: {
      fontSize: 16, // Increase font size
      fontWeight: "bold", // Make it bold
    },
    axisLabel: {
      formatter: (value) => Math.floor(value),
    },
  },
  yAxis: {
    type: "category",
    data: chartData.value.names.map((name) =>
      name.length > 15 ? `${name.slice(0, 10)}...` : name,
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
      const name = chartData.value.names[dataIndex];
      const count = value;
      return `<strong>Name:</strong> ${name}<br><strong>Count:</strong> ${count}`;
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
.most-accessed-chart-select-container {
  margin-top: 12px;
}
/* .loading-message {
  text-align: center;
  font-size: 16px;
  color: gray;
} */
</style>
