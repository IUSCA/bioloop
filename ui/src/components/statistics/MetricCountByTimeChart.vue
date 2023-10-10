<!-- 
  This component serves as a time-based chart for 3 different metrics that are tracked in Bioloop
  hourly - SDA space utilization, Slate-Scratch space utilization, and Slate-Scratch file quota 
  utilization. The metric whose chart is to be rendered is controlled through a prop.
-->
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
          {{ currentUsage.metricTitle }}: {{ currentUsage.metricCount }}
        </va-chip>
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

const _being_used = ref(); // (unformatted) latest measure for given metric
const _limit = ref(); // (unformatted) limit (max possible value) for given metric

// Contains the formatted latest measure for given metric, and the title used to display said metric
const currentUsage = computed(() => {
  let metricTitle, metricCount;
  switch (props.measurement) {
    case config.metric_measurements.SDA:
      metricTitle = "Current SDA Space Usage";
      metricCount = `${formatBytes(_being_used.value)} / ${formatBytes(
        _limit.value,
      )}`;
      break;
    case config.metric_measurements.SLATE_SCRATCH:
      metricTitle = "Current Slate-Scratch Space Usage";
      metricCount = `${formatBytes(_being_used.value)} / ${formatBytes(
        _limit.value,
      )}`;
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
      text: chartTitleCallBack,
      color: colors.FONT,
      font: {
        size: 18,
      },
    },
  },
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
      return "SDA Space Utilized";
    case config.metric_measurements.SLATE_SCRATCH:
      return "Slate-Scratch Space Utilized";
    case config.metric_measurements.SLATE_SCRATCH_FILES:
      return "Slate-Scratch File Count";
    default:
      console.log("Provided measurement value did not match expected values");
  }
};

const getDatasetColorsByTheme = (isDark) => {
  const DATA_POINT_COLORS = {
    [config.metric_measurements.SDA]: {
      light: "rgba(249, 205, 214, 1)",
      dark: "rgba(94, 40, 55, 1)",
    },
    [config.metric_measurements.SLATE_SCRATCH]: {
      light: "rgba(203, 189, 232, 1)",
      dark: "rgba(71, 50, 123, 1)",
    },
    [config.metric_measurements.SLATE_SCRATCH_FILES]: {
      light: "rgba(157, 205, 241, 1)",
      dark: "rgba(26, 78, 114, 1)",
    },
  };

  return {
    backgroundColor: isDark
      ? DATA_POINT_COLORS[props.measurement].dark
      : DATA_POINT_COLORS[props.measurement].light,
    borderColor: isDark
      ? DATA_POINT_COLORS[props.measurement].dark
      : DATA_POINT_COLORS[props.measurement].light,
  };
};

const configureChartStatistics = (datasets) => {
  const chartColors = getDatasetColorsByTheme(isDark.value);

  let ret = {
    datasets: datasets.map((dataset) => {
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

      // retrieved data is sorted (descending) by timestamps, so first element is the most recent
      // metric measurement
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

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  // update colors for metrics based on theme
  updatedChartData.datasets[0].backgroundColor = colors.backgroundColor;
  updatedChartData.datasets[0].borderColor = colors.borderColor;

  chartData.value = updatedChartData;
});

onMounted(() => {
  retrieveAndConfigureChartData();
});
</script>
