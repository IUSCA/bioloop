<template>
  <div class="flex flex-col gap-5">
    <div>
      <v-chart
        :option="chartOptions"
        autoresize
        style="height: 400px; width: 100%"
      />
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
        config.metric_measurements.SLATE_SCRATCH_FILES,
      ].includes(val),
  },
});

const _being_used = ref(); // (unformatted) latest measure for given metric
const _limit = ref(); // (unformatted) limit (max possible value) for given metric

const chartData = ref([]);
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
          ? firstDataPoint.value[0]
          : firstDataPoint[0];

        // Convert timestamp to a readable date
        const formattedDate = new Date(timestamp).toLocaleString();
        let tooltipText = `${formattedDate}<br/>`; // Display date & time

        // Loop through each line's data point
        params.forEach((param) => {
          // console.log("Tooltip param object:", param); // Debugging log

          // Check if `param` and `param.data` exist
          if (!param || !param.data || !param.data.value) {
            tooltipText += `${param.seriesName}: No data available<br/>`;
            return; // Continue to the next iteration
          }

          // Extract the `usage` value from `param.data.value[1]`
          const usageValue = param.data.value[1];
          // console.log("Extracted usage value:", usageValue); // Debugging log

          // Handle different measurement types
          let formattedValue;
          switch (props.measurement) {
            case config.metric_measurements.SDA:
            case config.metric_measurements.SLATE_SCRATCH:
              formattedValue = formatBytes(usageValue); // Convert usage to human-readable format
              break;
            case config.metric_measurements.SLATE_SCRATCH_FILES:
              formattedValue = usageValue; // Display raw usage value
              break;
            default:
              console.log("Measurement type did not match expected values");
              formattedValue = "Unknown measurement";
          }
          tooltipText += `${param.seriesName}: ${formattedValue}<br/>`;
        });

        return tooltipText;
      },
    },
    xAxis: {
      type: "time",
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
            getUniqueSortedYAxisValues().indexOf(item.usage), // Use the index in the y-axis categories
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
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      metricTitle = "Current Slate-Scratch File Quota Usage";
      metricCount = `${_being_used.value} / ${_limit.value}`;
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
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return "Slate-Scratch File Quota Utilization";
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const getUniqueSortedYAxisValues = () => {
  // Extract 'usage' values from chartData and create a Set to get unique values
  const uniqueValues = [...new Set(chartData.value.map((item) => item.usage))];
  console.log(uniqueValues);

  // Sort the values in ascending order
  return uniqueValues.sort((a, b) => a - b);
};

const getDatasetLabel = () => {
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      return "SDA Usage";
    case config.metric_measurements.SLATE_SCRATCH:
      return "Slate-Scratch Usage";
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return "Slate-Scratch Files Usage";
    default:
      return "Unknown Measurement";
  }
};

const yAxisTicksCallback = (val) => {
  // If the range of data-point values provided to chart.js is small enough
  switch (props.measurement) {
    case config.metric_measurements.SDA:
    case config.metric_measurements.SLATE_SCRATCH:
      return val % 1 !== 0 ? formatBytes(Math.floor(val)) : formatBytes(val);
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return val % 1 !== 0 ? Math.floor(val) : val;
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const retrieveAndConfigureChartData = () => {
  MetricsService.getSpaceUtilizationByTimeAndMeasurement(props.measurement)
    .then((res) => {
      chartData.value = res.data;
      _being_used.value = res.data.length > 0 ? res.data[0].usage : 0;
      _limit.value = res.data.length > 0 ? res.data[0].limit : 0;
    })
    .catch((err) => {
      console.log(
        `Unable to fetch metrics for measurement ${props.measurement}`,
        err,
      );
      toast.error(
        `Unable to fetch metrics for measurement ${props.measurement}`,
      );
    });
};

onMounted(() => {
  retrieveAndConfigureChartData();
});
</script>
