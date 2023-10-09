<template>
  <div class="flex flex-col gap-5">
    <div>
      <BarChart :chart-data="chartData" :chart-options="chartOptions">
      </BarChart>
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
import { getDefaultChartColors } from "@/services/charts";
import config from "@/config";
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
        label: (context) => context.dataset.data[context.dataIndex],
        afterLabel: (context) => {
          const accessType = context.dataset.accessTypes[context.dataIndex];
          const path = context.dataset.paths[context.dataIndex];
          const isDirectDownload = accessType === config.access_types.BROWSER;
          const accessedEntityType = isDirectDownload ? "FILE" : "DATASET";
          const datasetName = context.dataset.datasetNames[context.dataIndex];

          const ret = [
            `Access Method: ${accessType}`,
            `Type: ${accessedEntityType}`,
          ];
          if (path) {
            ret.push(`Path: ${path}`);
          }
          if (datasetName) {
            ret.push(`Assoc. Dataset: ${datasetName}`);
          }

          return ret;
        },
      },
    },
    title: {
      display: true,
      text: "Most Frequently Accessed Files/Datasets",
      color: colors.FONT,
      font: {
        size: 18,
      },
    },
  },
});

const getDatasetColorsByTheme = (isDark) => {
  return {
    FILE: {
      backgroundColor: isDark
        ? "rgba(118, 98, 45, 1)"
        : "rgba(252, 222, 155, 1)",
    },
    DATASET: {
      backgroundColor: isDark
        ? "rgba(35, 92, 95, 1)"
        : "rgba(198, 231, 231, 1)",
    },
  };
};

const configureChartData = (most_accessed_stats) => {
  const label_delimit_count = 15;

  const labels = most_accessed_stats.map((stat) => {
    return stat.name.length <= label_delimit_count
      ? stat.name
      : `${stat.name.slice(0, label_delimit_count - 3)}...`;
  });

  const datasetColors = getDatasetColorsByTheme(isDark.value);

  const datasets = [
    {
      label: "Number of Times File/Dataset was Accessed",
      data: most_accessed_stats.map((stat) => stat.count),
      names: most_accessed_stats.map((stat) => stat.count),
      accessTypes: most_accessed_stats.map((stat) => stat.access_type),
      paths: most_accessed_stats.map((stat) => stat.path),
      datasetNames: most_accessed_stats.map((stat) => stat.dataset_name),
      backgroundColor: most_accessed_stats.map((stat) =>
        stat.access_type === config.access_types.BROWSER
          ? datasetColors.FILE.backgroundColor
          : datasetColors.DATASET.backgroundColor,
      ),
    },
  ];

  // const labels = [["x,0", "1", "2"], "y", "z"];
  // const datasets = [
  //   { label: "test", data: [3, 4, 5], path: ["/3/", "/4", "5"] },
  // ];
  return { labels, datasets };
};

const retrieveAndConfigureChartData = () => {
  StatisticsService.getMostAccessedData(numberOfEntriesRetrieved.value, true)
    .then((res) => {
      chartData.value = configureChartData(res.data);
    })
    .catch((err) => {
      console.log("Unable to retrieve most accessed files", err);
      toast.error("Unable to retrieve most accessed files");
    });
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);

  let updatedChartData = _.cloneDeep(chartData.value);
  const updatedColors = updatedChartData.datasets[0].accessTypes.map((type) => {
    return type === config.access_types.BROWSER
      ? colors.FILE.backgroundColor
      : colors.DATASET.backgroundColor;
  });
  updatedChartData.datasets[0].backgroundColor = updatedColors;
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
.most-accessed-chart-select-container {
  margin-top: 12px;
}
</style>
