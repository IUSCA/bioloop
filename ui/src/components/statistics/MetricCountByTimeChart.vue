<template>
  <div class="flex flex-col gap-5">
    <div>
      <v-chart
        v-if="!isLoading && !isNoData"
        :option="chartOptions"
        autoresize
        style="height: 400px; width: 100%"
      />
      <div
        v-else-if="isLoading"
        class="flex justify-center items-center"
        style="height: 400px; font-size: 24px"
      >
        Loading...
      </div>

      <!-- Display 'No Data Found' if no data is fetched -->
      <div
        v-else
        class="flex justify-center items-center"
        style="height: 400px; font-size: 24px"
      >
        No Data Found
      </div>
    </div>
    <div class="flex flex-row justify-center">
      <div class="max-w-max">
        <va-chip outline>
          {{ currentUsage.metricTitle }}: {{ currentUsage.metricCount }}
        </va-chip>
      </div>
    </div>
  </div>
</template>

<script setup>
import config from "@/config";
import MetricsService from "@/services/metrics";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import { LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, onMounted, ref } from "vue";
import VChart from "vue-echarts";

// Register ECharts components
use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

const props = defineProps({
  measurement: {
    type: String,
    required: true,
    validator: (val) =>
      [
        config.metric_measurements.SDA,
        config.metric_measurements.SLATE_SCRATCH,
      ].includes(val),
  },
});

const _being_used = ref(); // (unformatted) latest measure for given metric
const _limit = ref(); // (unformatted) limit (max possible value) for given metric
const isLoading = ref(false); // Flag to indicate if data has been loaded
const isNoData = ref(false); // Track if data is empty

const chartData = ref([]);
const tooltipData = ref([]);
const chartOptions = computed(() => {
  return {
    title: {
      text: chartTitleCallBack(),
    },
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        if (!params || params.length === 0) return "No data available"; // Handle no data

        // Access the timestamp from the first data point in `params`
        const firstDataPoint = params[0].data;
        const timestamp = firstDataPoint.value
          ? firstDataPoint.value[0] // This is the timestamp
          : firstDataPoint[0];
        const formattedDate = new Date(timestamp).toISOString().split("T")[0];
        let tooltipText = `${formattedDate}<br/>`; // Display date

        // Find usage value based on the timestamp in tooltipData
        const matchedData = tooltipData.value.find(
          (data) => data.timestamp === timestamp,
        );

        // Loop through each line's data point
        params.forEach((param) => {
          // Check if `param` and `param.data` exist
          if (!param || !param.data || !param.data.value) {
            tooltipText += `${param.seriesName}: No data available<br/>`;
            return; // Continue to the next iteration
          }

          // Extract the `usage` value
          const usageValue = matchedData
            ? matchedData.usage
            : "No usage data available";
          const formattedValue = formatBytes(usageValue);

          tooltipText += `${param.seriesName}: ${formattedValue}<br/>`;
        });

        return tooltipText;
      },
    },

    xAxis: {
      type: "time",
      axisLabel: {
        formatter: (value) => {
          // Create a new date object from the timestamp
          const date = new Date(value);
          // Format the date as DD/MM/YYYY
          const day = String(date.getDate()).padStart(2, "0"); // Pad single digits with a leading zero
          const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
          const year = date.getFullYear();
          return `${year}/${month}/${day}`;
        },
      },
    },
    yAxis: {
      type: "category",
      data: getUniqueSortedYAxisValues(), // Provide the unique sorted y-axis values as categories
      axisLabel: {
        formatter: (value) => yAxisTicksCallback(value), // Use the yAxisTicksCallback function here
      },
    },
    grid: {
      left: "10%",
      right: "10%",
      bottom: "15%",
      containLabel: true,
    },
    series: [
      {
        name: getDatasetLabel(),
        type: "line",
        data: chartData.value.map((item) => ({
          value: [
            item.timestamp,
            //item.usage,
            getUniqueSortedYAxisValues().indexOf(item.usage), // Use the index in the y-axis categories
            //console.log(item.usage),
            //console.log("chartData.value:", chartData.value),
            //console.log(getUniqueSortedYAxisValues().indexOf(item.usage)),
          ],
        })),
      },
    ],
  };
});

const currentUsage = computed(() => {
  let metricTitle, metricCount;
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      metricTitle = "Current SDA Space Usage";
      metricCount = `${formatBytes(_being_used.value)} / ${formatBytes(_limit.value)}`;
      break;
    case config.metric_measurements.SLATE_SCRATCH:
      metricTitle = "Current Slate-Scratch Space Usage";
      metricCount = `${formatBytes(_being_used.value)} / ${formatBytes(_limit.value)}`;
      break;
    default:
      console.log("Provided measurement value did not match expected values");
  }
  return {
    metricTitle,
    metricCount,
  };
});

const chartTitleCallBack = () => {
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      return "SDA Space Utilization";
    case config.metric_measurements.SLATE_SCRATCH:
      return "Slate-Scratch Space Utilization";
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const getUniqueSortedYAxisValues = () => {
  // Extract 'usage' values from chartData and create a Set to get unique values
  const uniqueValues = [...new Set(chartData.value.map((item) => item.usage))];
  //console.log(uniqueValues);

  // Sort the values in ascending order
  return uniqueValues.sort((a, b) => a - b);
};

const getDatasetLabel = () => {
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      return "SDA Usage";
    case config.metric_measurements.SLATE_SCRATCH:
      return "Slate-Scratch Usage";
    default:
      return "Unknown Measurement";
  }
};

const yAxisTicksCallback = (val) => {
  return val % 1 !== 0 ? formatBytes(Math.floor(val)) : formatBytes(val);
};

const retrieveAndConfigureChartData = () => {
  isLoading.value = true; // Set loading to true when starting the fetch
  isNoData.value = false; // Reset noData state before fetching data

  MetricsService.getSpaceUtilizationByTimeAndMeasurement(props.measurement)
    .then((res) => {
      // Group by day and select the last hourly entry per day
      const dataByDay = res.data.reduce((acc, item) => {
        const day = item.timestamp.split("T")[0];

        // If the day is already in the accumulator, compare timestamps
        if (acc[day]) {
          // Keep the entry with the later timestamp
          const currentTime = new Date(item.timestamp).getTime();
          const existingTime = new Date(acc[day].timestamp).getTime();
          if (currentTime > existingTime) {
            acc[day] = item;
          }
        } else {
          // Add the first occurrence for the day
          acc[day] = item;
        }

        return acc;
      }, {});
      const filteredData = Object.values(dataByDay);

      // Set chartData to the filtered data
      chartData.value = filteredData;

      _being_used.value = filteredData.length > 0 ? filteredData[0].usage : 0;
      _limit.value = filteredData.length > 0 ? filteredData[0].limit : 0;

      tooltipData.value = filteredData.map((item) => ({
        timestamp: item.timestamp,
        usage: item.usage,
      }));
      const totalUsageValues = filteredData.map((item) => item.usage).length;
      const totalTimestampValues = filteredData.map(
        (item) => item.timestamp,
      ).length;

      if (totalUsageValues === 0 && totalTimestampValues === 0) {
        isNoData.value = true; // Set no data found
      } else {
        isNoData.value = false; // Data found
      }
    })
    .catch((err) => {
      console.log(
        `Unable to fetch metrics for measurement ${props.measurement}`,
        err,
      );
      toast.error(
        `Unable to fetch metrics for measurement ${props.measurement}`,
      );
    })
    .finally(() => {
      isLoading.value = false; // Set loading to false after fetch completes
    });
};

onMounted(() => {
  retrieveAndConfigureChartData();
});
</script>
