<template>
  <div class="flex flex-col gap-5">
    <div>
      <BarChart :chart-data="chartData" :chart-options="chartOptions">
      </BarChart>
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
import { formatBytes } from "@/services/utils";
import { getDefaultChartColors } from "@/services/charts";
import _ from "lodash";
import { useToastStore } from "@/stores/toast";

const isDark = useDark();
const toast = useToastStore();

const defaultChartColors = computed(() => {
  return getDefaultChartColors(isDark.value);
});

const chartData = ref({});

const chartOptions = computed(() => {
  return getChartOptions({
    colors: defaultChartColors.value,
  });
});

const dropdownOptions = [10, 20];
const numberOfEntriesRetrieved = ref(dropdownOptions[0]);

const getChartOptions = ({ colors }) => ({
  // https://www.chartjs.org/docs/latest/charts/bar.html#dataset-properties
  indexAxis: "y",
  color: colors.FONT,
  scales: {
    x: {
      ticks: {
        color: colors.FONT,
        callback: (val) => {
          // If the range of data-point values provided to chart.js is small enough (say starting
          // value is 1, and ending value is 2), chart.js's default behavior is to try and
          // spread out this range over decimal values (1.1, 1.2,..., 1.9, 2) to calculate
          // the axis's ticks. Since number of bytes should be an integer, we round the value
          // down to nearest integer.
          return val % 1 !== 0
            ? formatBytes(Math.floor(val))
            : formatBytes(val);
        },
      },
      grid: {
        color: colors.GRID,
      },
    },
    y: {
      ticks: {
        color: colors.FONT,
      },
      grid: {
        color: colors.GRID,
      },
    },
  },
  plugins: {
    tooltip: {
      backgroundColor: colors.TOOLTIP.BACKGROUND,
      titleColor: colors.TOOLTIP.FONT,
      bodyColor: colors.TOOLTIP.FONT,
      // https://www.chartjs.org/docs/latest/configuration/tooltip.html#tooltip-callbacks
      callbacks: {
        label: (context) =>
          formatBytes(context.dataset.data[context.dataIndex]),
        afterLabel: (context) => {
          return [`Name: ${context.dataset.names[context.dataIndex]}`];
        },
      },
    },
    title: {
      display: true,
      text: "Users by Bandwidth Consumption",
      color: colors.FONT,
      font: {
        size: 18,
      },
    },
  },
});

const getDatasetColorsByTheme = (isDark) => {
  return {
    backgroundColor: isDark ? "rgba(74, 77, 83, 1)" : "rgba(201, 203, 207, 1)",
  };
};

const formatChartStatistics = (user_bandwidth_stats) => {
  const labels = user_bandwidth_stats.map((stat) => stat.name);
  const chartColors = getDatasetColorsByTheme(isDark.value);

  const datasets = [
    {
      label: "Bandwidth Consumed",
      data: user_bandwidth_stats.map((stat) => stat.bandwidth),
      names: user_bandwidth_stats.map((stat) => stat.name),
      userNames: user_bandwidth_stats.map((stat) => stat.username),
      backgroundColor: chartColors.backgroundColor,
    },
  ];

  return { labels, datasets };
};

const retrieveAndConfigureChartData = () => {
  StatisticsService.getUsersByBandwidthConsumption(
    numberOfEntriesRetrieved.value,
  )
    .then((res) => {
      chartData.value = formatChartStatistics(res.data);
    })
    .catch((err) => {
      console.log("Unable to retrieve user count", err);
      toast.error("Unable to retrieve user count");
    });
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  updatedChartData.datasets[0].backgroundColor = colors.backgroundColor;

  chartData.value = updatedChartData;
});

watch(numberOfEntriesRetrieved, () => {
  retrieveAndConfigureChartData();
});

onMounted(() => {
  retrieveAndConfigureChartData();
});
</script>

<style scoped>
.user-bandwidth-chart-select-container {
  margin-top: 12px;
}
</style>
