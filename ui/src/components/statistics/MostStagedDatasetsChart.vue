<template>
  <div class="flex flex-col gap-5">
    <div>
      <BarChart :chart-data="chartData" :chart-options="chartOptions">
      </BarChart>
    </div>
    <div class="flex flex-row justify-center">
      <div class="max-w-max most-staged-datasets-chart-select-container">
        <span>Showing top&nbsp;&nbsp;&nbsp;</span>
        <va-select
          class="w-20"
          :options="dropdownOptions"
          v-model="numberOfEntriesRetrieved"
        />
        <span>&nbsp;&nbsp;&nbsp;staged datasets</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import StatisticsService from "@/services/statistics";
import { getDefaultChartColors } from "@/services/charts";
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

const label_delimit_count = 15;

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
      callbacks: {
        label: (context) => context.dataset.data[context.dataIndex],
      },
    },
    title: {
      display: true,
      text: "Most Frequently Staged Datasets",
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

const configureChartData = (most_staged_stats) => {
  const labels = most_staged_stats.map((stat) => {
    return stat.dataset_name.length <= label_delimit_count
      ? stat.dataset_name
      : `${stat.dataset_name.slice(0, label_delimit_count - 3)}...`;
  });

  const chartColors = getDatasetColorsByTheme(isDark.value);

  const datasets = [
    {
      label: "Number of Times Dataset was Staged",
      data: most_staged_stats.map((stat) => stat.count),
      names: most_staged_stats.map((stat) => stat.dataset_name),
      backgroundColor: chartColors.backgroundColor,
    },
  ];

  // const labels = [["x,0", "1", "2"], "y", "z"];
  // const datasets = [
  //   { label: "test", data: [3, 4, 5], path: ["/3/", "/4", "5"] },
  // ];
  return { labels, datasets };
};

const retrieveAndConfigureChartData = () => {
  StatisticsService.getMostStagedDatasets(numberOfEntriesRetrieved.value).then(
    (res) => {
      chartData.value = configureChartData(res.data);
    },
  );
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  // update colors for aggregated access counts
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
.most-staged-datasets-chart-select-container {
  margin-top: 12px;
}
</style>
