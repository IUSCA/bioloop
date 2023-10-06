<template>
  <LineChart :chart-data="chartData" :chart-options="chartOptions"></LineChart>
</template>

<script setup>
import "chartjs-adapter-date-fns";
import { enUS } from "date-fns/locale";
import StatisticsService from "@/services/statistics";
import { getDefaultChartColors } from "@/services/charts";
import { date } from "@/services/datetime";
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
        callback: (val) => {
          if (val % 1 === 0) {
            return val;
          }
        },
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
        label: (context) => context.dataset.data[context.dataIndex].y,
      },
    },
    title: {
      display: true,
      text: "Registered User Count by Date",
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
    borderColor: isDark ? "rgba(74, 77, 83, 1)" : "rgba(201, 203, 207, 1)",
  };
};

const configureChartStatistics = (user_count_logs) => {
  const chart_data = [];
  user_count_logs.forEach((log) => {
    chart_data.push({
      x: log.created_at,
      y: log.count,
    });
  });

  return { datasets: [{ data: chart_data }] };
};

const retrieveAndConfigureChartData = () => {
  StatisticsService.getUserCountGroupedByDate()
    .then((res) => res.data)
    .then((data) => {
      chartData.value = configureChartStatistics(data);
      chartData.value.datasets[0].label = "Number of Users, grouped by date";

      const chartColors = getDatasetColorsByTheme(isDark.value);
      chartData.value.datasets[0].backgroundColor = chartColors.backgroundColor;
      chartData.value.datasets[0].borderColor = chartColors.borderColor;
    });
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  updatedChartData.datasets[0].backgroundColor = colors.backgroundColor;
  updatedChartData.datasets[0].borderColor = colors.borderColor;

  chartData.value = updatedChartData;
});

onMounted(() => {
  retrieveAndConfigureChartData();
});
</script>
