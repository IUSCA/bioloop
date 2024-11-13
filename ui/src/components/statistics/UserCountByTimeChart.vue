<template>
  <div>
    <!-- Display 'Loading' while data is being fetched -->
    <div
      v-if="loading"
      class="flex justify-center items-center"
      style="height: 500px; font-size: 24px"
    >
      Loading...
    </div>

    <!-- Display 'No Data Found' if no data is fetched -->
    <div
      v-else-if="noData"
      class="flex justify-center items-center"
      style="height: 500px; font-size: 24px"
    >
      No Data Found
    </div>
    <v-chart
      :option="chartOptions"
      autoresize
      style="height: 500px; width: 100%"
    />
  </div>
</template>

<script setup>
import { date } from "@/services/datetime";
import StatisticsService from "@/services/statistics";
import toast from "@/services/toast";
import "dayjs/locale/en";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, onMounted, ref } from "vue";
import VChart from "vue-echarts";

// Register necessary components in ECharts
use([
  LineChart,
  CanvasRenderer,
  GridComponent,
  TooltipComponent,
  TitleComponent,
]);

// Register the component globally (Optional if used globally)
const chartData = ref({});
// Reactive variables for loading and data state
const loading = ref(true); // Track loading state
const noData = ref(false); // Track if there's no data

// Function to format the date using the provided 'processUserCountLogs' function
const processUserCountLogs = (user_count_logs) => {
  const XAxisData = [];
  const YAxisData = [];

  user_count_logs.forEach((log) => {
    const formattedDate = date(log.created_at); // Format the date using dayjs
    XAxisData.push(formattedDate); // Add the formatted date to XAxisData
    YAxisData.push({
      value: log.cumulative_sum, // Use 'value' to ensure it's correctly processed
      label: formattedDate, // Add the formatted date as a label
    });
  });

  return {
    XAxisData,
    YAxisData,
  };
};

// Chart options for ECharts
const chartOptions = computed(() => {
  if (!chartData.value.XAxisData || !chartData.value.YAxisData) return {};

  // Extract the final cumulative_sum value
  const totalUsers =
    chartData.value.YAxisData.length > 0
      ? chartData.value.YAxisData[chartData.value.YAxisData.length - 1].value
      : 0;

  return {
    title: {
      text: `Total no. of users registered: ${totalUsers}`, // Chart Title
      left: "center",
    },
    tooltip: {
      trigger: "axis", // Tooltip on hover
      formatter: function (params) {
        const data = params[0].data;
        return `${data.label}: ${data.value} users`;
      },
    },
    xAxis: {
      type: "category",
      data: chartData.value.XAxisData, // X-axis data (dates)
      name: "Date", // X-axis title
      nameLocation: "middle",
      nameGap: 50, // Increase the gap between axis title and axis line
      nameTextStyle: {
        fontSize: 16, // Increase font size
        fontWeight: "bold", // Make it bold
      },
      axisLabel: {
        rotate: 45, // Rotate labels for better visibility
        formatter: function (value) {
          // Split the date string and remove the year
          const [month, day] = value.split(" ");
          return `${month} ${day}`; // Return only month and day
        },
      },
      boundaryGap: false, // Line starts at the X-axis
    },
    yAxis: {
      type: "value",
      minInterval: 1, // Ensure Y-axis is in whole numbers
    },
    series: [
      {
        name: "User Count",
        type: "line", // Line chart type
        data: chartData.value.YAxisData, // Y-axis data (user counts with labels)
        smooth: true, // Smooth curve
        lineStyle: {
          color: "#5470C6",
        },
      },
    ],
  };
});

// Function to retrieve and configure chart data
const retrieveAndConfigureChartData = () => {
  loading.value = true; // Set loading to true
  noData.value = false; // Reset noData state
  StatisticsService.getUserCountGroupedByDate()
    .then((res) => {
      const data = res.data;
      if (data && data.length > 0) {
        const processedData = processUserCountLogs(data);
        chartData.value = processedData; // Assign processed data to chartData
        noData.value = false; // Data exists
      } else {
        noData.value = true; // No data found
        chartData.value = {}; // Reset chartData
      }
    })
    .catch((err) => {
      console.log("Unable to retrieve user count", err);
      toast.error("Unable to retrieve user count");
      noData.value = true; // Set noData to true if there is an error
      chartData.value = {}; // Reset chartData
    })
    .finally(() => {
      loading.value = false; // Set loading to false after processing
    });
};

// Retrieve data and configure chart on component mount
onMounted(() => {
  retrieveAndConfigureChartData();
});
</script>
