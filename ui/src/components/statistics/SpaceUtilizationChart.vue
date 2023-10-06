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
          Total SDA Usage: {{ formatBytes(totalSDASpaceUsage) }}
        </va-chip>
        &nbsp;&nbsp;
        <va-chip outline>
          Total Slate-Scratch Usage: {{ formatBytes(totalScratchSpaceUsage) }}
        </va-chip>
      </div>
    </div>
  </div>
</template>

<script setup>
import "chartjs-adapter-date-fns";
import { enUS } from "date-fns/locale";
import MetricsService from "@/services/metrics";
import { formatBytes } from "@/services/utils";
import { getDefaultChartColors } from "@/services/charts";
import { date } from "@/services/datetime";
import config from "@/config";
import _ from "lodash";

const isDark = useDark();

const defaultChartColors = computed(() => {
  return getDefaultChartColors(isDark.value);
});

const chartData = ref({});

const chartOptions = computed(() => {
  return getChartOptions({
    colors: defaultChartColors.value,
  });
});

const totalSpaceUsage = ref({});

const totalSDASpaceUsage = computed(() => {
  if (totalSpaceUsage.value?.length > 0) {
    return totalSpaceUsage.value.find(
      (e) => e.measurement === config.metric_measurements.SDA,
    )?.total_usage;
  }
});

const totalScratchSpaceUsage = computed(() => {
  if (totalSpaceUsage.value?.length > 0) {
    return totalSpaceUsage.value.find(
      (e) => e.measurement === config.metric_measurements.SLATE_SCRATCH,
    )?.total_usage;
  }
});

const getChartOptions = ({ colors }) => ({
  hover: { mode: null },
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
        callback: (val) => formatBytes(val),
      },
      grid: {
        color: colors.GRID,
      },
    },
  },
  adapters: {
    date: {
      locale: enUS,
    },
  },
  plugins: {
    tooltip: {
      backgroundColor: colors.TOOLTIP.BACKGROUND,
      titleColor: colors.TOOLTIP.FONT,
      bodyColor: colors.TOOLTIP.FONT,
      callbacks: {
        title: (arr) => {
          return date(arr[0].dataset.data[arr[0].dataIndex].x);
        },
        label: (context) =>
          formatBytes(context.dataset.data[context.dataIndex].y),
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

const getDatasetColorsByTheme = (isDark) => {
  return {
    SDA: {
      backgroundColor: isDark
        ? "rgba(94, 40, 55, 1)"
        : "rgba(249, 205, 214, 1)",
      borderColor: isDark ? "rgba(94, 40, 55, 1)" : "rgba(249, 205, 214, 1)",
    },
    SLATE_SCRATCH: {
      backgroundColor: isDark
        ? "rgba(71, 50, 123, 1)"
        : "rgba(157, 205, 241, 1)",
      borderColor: isDark ? "rgba(71, 50, 123, 1)" : "rgba(157, 205, 241, 1)",
    },
    SLATE_SCRATCH_FILES: {
      backgroundColor: isDark
        ? "rgba(26, 78, 114, 1)"
        : "rgba(203, 189, 232, 1)",
      borderColor: isDark ? "rgba(26, 78, 114, 1)" : "rgba(203, 189, 232, 1)",
    },
  };
};

const configureChartStatistics = (datasets) => {
  const chartColors = getDatasetColorsByTheme(isDark.value);

  return {
    datasets: datasets.map((dataset) => {
      const is_SDA_metrics = _.every(
        dataset,
        (e) =>
          e.measurement && e.measurement === config.metric_measurements.SDA,
      );
      const is_Scratch_metrics = _.every(
        dataset,
        (e) =>
          e.measurement &&
          e.measurement === config.metric_measurements.SLATE_SCRATCH,
      );
      const colors = is_SDA_metrics
        ? chartColors.SDA
        : is_Scratch_metrics
        ? chartColors.SLATE_SCRATCH
        : chartColors.SLATE_SCRATCH_FILES;

      return {
        data: dataset.map((log) => ({
          x: log.date,
          y: log.total_usage,
        })),
        backgroundColor: colors.backgroundColor,
        borderColor: colors.borderColor,
      };
    }),
  };
};

const retrieveAndConfigureChartData = () => {
  MetricsService.getSpaceUtilizationByTimeAndMeasurement().then((res) => {
    const data = res.data;
    chartData.value = configureChartStatistics([
      data.filter(
        (e) => e.measurement === config.metric_measurements.SLATE_SCRATCH,
      ),
      data.filter(
        (e) => e.measurement === config.metric_measurements.SLATE_SCRATCH_FILES,
      ),
      data.filter((e) => e.measurement === config.metric_measurements.SDA),
    ]);

    chartData.value.datasets[0].label = "Slate-Scratch Utilization";
    chartData.value.datasets[1].label = "Slate-Scratch Files Utilization";
    chartData.value.datasets[2].label = "SDA Utilization";
  });
};

const retrieveTotalSpaceConsumption = () => {
  MetricsService.getTotalSpaceUtilizationByMeasurement().then((res) => {
    totalSpaceUsage.value = res.data;
  });
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  // update colors for Slate-Scratch metrics
  updatedChartData.datasets[0].backgroundColor =
    colors.SLATE_SCRATCH_FILES.backgroundColor;
  updatedChartData.datasets[0].borderColor =
    colors.SLATE_SCRATCH_FILES.borderColor;
  // update colors for Slate-Scratch file metrics
  updatedChartData.datasets[1].backgroundColor =
    colors.SLATE_SCRATCH.backgroundColor;
  updatedChartData.datasets[1].borderColor = colors.SLATE_SCRATCH.borderColor;
  // update colors for SDA metrics
  updatedChartData.datasets[2].backgroundColor = colors.SDA.backgroundColor;
  updatedChartData.datasets[2].borderColor = [colors.SDA.borderColor];

  chartData.value = updatedChartData;
});

onMounted(() => {
  retrieveAndConfigureChartData();
  retrieveTotalSpaceConsumption();
});
</script>
