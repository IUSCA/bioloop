<template>
  <div class="flex flex-col gap-5">
    <div>
      <LineChart
        :chart-data="chartData"
        :chart-options="chartOptions"
      ></LineChart>
    </div>
    <div class="flex flex-row justify-center">
      <div class="max-w-max">
        <va-chip outline>
          {{ totals.metricTitle }}: {{ totals.metricCount }}
        </va-chip>
        <!-- &nbsp;&nbsp;
        <va-chip outline>
          Total Slate-Scratch Usage: {{ formatBytes(totalScratchSpaceUsage) }}
        </va-chip> -->
      </div>
    </div>
  </div>
</template>

<script setup>
import dayjs from "dayjs";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";
import "dayjs/locale/en";
import MetricsService from "@/services/metrics";
import { formatBytes } from "@/services/utils";
import { getDefaultChartColors } from "@/services/charts";
import { absolute } from "@/services/datetime";
import config from "@/config";
import _ from "lodash";
import { useToastStore } from "@/stores/toast";

const props = defineProps({
  measurement: String,
});

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

const _being_used = ref();
const _limit = ref();

const totals = computed(() => {
  let metricTitle, metricCount;
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      metricTitle = "SDA Usage";
      metricCount = `${formatBytes(_being_used.value)} / ${formatBytes(
        _limit.value,
      )}`;
      break;
    case config.metric_measurements.SLATE_SCRATCH:
      metricTitle = "Slate-Scratch Usage";
      metricCount = `${formatBytes(_being_used.value)} / ${formatBytes(
        _limit.value,
      )}`;
      break;
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      metricTitle = "Slate-Scratch File Quota Usage";
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

// const totalSpaceUsage = ref({});

// const totalSDASpaceUsage = computed(() => {
//   if (totalSpaceUsage.value?.length > 0) {
//     return totalSpaceUsage.value.find(
//       (e) => e.measurement === config.metric_measurements.SDA,
//     )?.total_usage;
//   }
// });

// const totalScratchSpaceUsage = computed(() => {
//   if (totalSpaceUsage.value?.length > 0) {
//     return totalSpaceUsage.value.find(
//       (e) => e.measurement === config.metric_measurements.SLATE_SCRATCH,
//     )?.total_usage;
//   }
// });

const getChartOptions = ({ colors }) => ({
  color: colors.FONT,
  scales: {
    x: {
      ticks: {
        color: colors.FONT,
      },
      type: "time", // https://www.chartjs.org/docs/latest/axes/cartesian/time.html#configuration-options
      time: {
        unit: "month",
      },
      grid: {
        color: colors.GRID,
      },
    },
    y: {
      ticks: {
        color: colors.FONT,
        callback: yAxisTicksCallback,
      },
      grid: {
        color: colors.GRID,
      },
    },
  },
  adapters: {
    date: {
      locale: dayjs().locale("en"),
    },
  },
  plugins: {
    tooltip: {
      backgroundColor: colors.TOOLTIP.BACKGROUND,
      titleColor: colors.TOOLTIP.FONT,
      bodyColor: colors.TOOLTIP.FONT,
      callbacks: {
        title: (arr) => {
          return absolute(arr[0].dataset.data[arr[0].dataIndex].x);
        },
        label: toolTipLabelCallback,
      },
    },
    title: {
      display: true,
      text: "Device Space Utilization",
      color: colors.FONT,
      font: {
        size: 18,
      },
    },
  },
});

const yAxisTicksCallback = (val) => {
  // https://www.chartjs.org/docs/latest/axes/labelling.html#creating-custom-tick-formats
  switch (props.measurement) {
    case config.metric_measurements.SDA:
    case config.metric_measurements.SLATE_SCRATCH:
      return formatBytes(val);
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return val;
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const toolTipLabelCallback = (context) => {
  // https://www.chartjs.org/docs/latest/configuration/tooltip.html#label-callback
  switch (props.measurement) {
    case config.metric_measurements.SDA:
    case config.metric_measurements.SLATE_SCRATCH:
      return formatBytes(context.dataset.data[context.dataIndex].y);
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return context.dataset.data[context.dataIndex].y;
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const getDatasetLabel = () => {
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      return "SDA Space Utilization";
    case config.metric_measurements.SLATE_SCRATCH:
      return "Slate-Scratch Space Utilization";
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return "Slate-Scratch File Count";
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const getDatasetColorsByTheme = (isDark) => {
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      return {
        backgroundColor: isDark
          ? "rgba(94, 40, 55, 1)"
          : "rgba(249, 205, 214, 1)",
        borderColor: isDark ? "rgba(94, 40, 55, 1)" : "rgba(249, 205, 214, 1)",
      };
    case config.metric_measurements.SLATE_SCRATCH:
      return {
        backgroundColor: isDark
          ? "rgba(71, 50, 123, 1)"
          : "rgba(157, 205, 241, 1)",
        borderColor: isDark ? "rgba(71, 50, 123, 1)" : "rgba(157, 205, 241, 1)",
      };
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return {
        backgroundColor: isDark
          ? "rgba(26, 78, 114, 1)"
          : "rgba(203, 189, 232, 1)",
        borderColor: isDark ? "rgba(26, 78, 114, 1)" : "rgba(203, 189, 232, 1)",
      };
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const configureChartStatistics = (datasets) => {
  const chartColors = getDatasetColorsByTheme(isDark.value);

  let ret = {
    datasets: datasets.map((dataset) => {
      // const is_SDA_metrics = _.every(
      //   dataset,
      //   (e) =>
      //     e.measurement && e.measurement === config.metric_measurements.SDA,
      // );
      // const is_Scratch_metrics = _.every(
      //   dataset,
      //   (e) =>
      //     e.measurement &&
      //     e.measurement === config.metric_measurements.SLATE_SCRATCH,
      // );
      // const colors = is_SDA_metrics
      //   ? chartColors.SDA
      //   : is_Scratch_metrics
      //   ? chartColors.SLATE_SCRATCH
      //   : chartColors.SLATE_SCRATCH_FILES;

      return {
        data: dataset.map((log) => ({
          x: log.timestamp,
          y: log.usage,
        })),
        backgroundColor: chartColors.backgroundColor,
        borderColor: chartColors.borderColor,
      };
    }),
  };

  return ret;
};

const retrieveAndConfigureChartData = () => {
  MetricsService.getSpaceUtilizationByTimeAndMeasurement(props.measurement)
    .then((res) => {
      chartData.value = configureChartStatistics([res.data]);
      chartData.value.datasets[0].label = getDatasetLabel();

      // sort by most recent value of 'usage', to get the most recent metric measurement
      _being_used.value = res.data[0].usage;
      _limit.value = res.data[0].limit;
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

// const retrieveTotalSpaceConsumption = () => {
//   MetricsService.getTotalSpaceUtilizationByMeasurement().then((res) => {
//     totalSpaceUsage.value = res.data;
//   });
// };

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  // update colors for Slate-Scratch metrics
  updatedChartData.datasets[0].backgroundColor = colors.backgroundColor;
  updatedChartData.datasets[0].borderColor = colors.borderColor;

  chartData.value = updatedChartData;
});

onMounted(() => {
  retrieveAndConfigureChartData();
  // retrieveTotalSpaceConsumption();
});
</script>
