<template>
  <div class="flex flex-col gap-5">
    <div>
      <PieChart
        :chart-data="chartData"
        :chart-options="chartOptions"
      ></PieChart>
    </div>
  </div>
  <div class="flex flex-row justify-center mt-3">
    <div class="max-w-max">
      <va-chip outline> Total Access Count: {{ totalAccessCount }} </va-chip>
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

const totalAccessCount = computed(() => {
  if (chartData.value.datasets) {
    return chartData.value.datasets[0].data.reduce(
      (accumulator, currentValue) => accumulator + currentValue,
      0,
    );
  }
});

const getChartOptions = ({ colors }) => {
  return {
    aspectRatio: 1.8,
    color: colors.FONT,
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
        text: "Data Access Counts by Access Method",
        color: colors.FONT,
        font: {
          size: 18,
        },
      },
    },
  };
};

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

const configureChartData = (data) => {
  // return {
  //   labels: ["VueJs", "EmberJs", "ReactJs", "AngularJs"],
  //   datasets: [
  //     {
  //       backgroundColor: ["#41B883", "#E46651", "#00D8FF", "#DD1B16"],
  //       data: [40, 20, 80, 10],
  //     },
  //   ],
  // };
  const chartColors = getDatasetColorsByTheme(isDark.value);

  return {
    labels: data.map((e) => e.access_type),
    datasets: [
      {
        data: data.map((e) => e.count),
        backgroundColor: data.map((e) =>
          e.access_type === config.access_types.BROWSER
            ? chartColors.FILE.backgroundColor
            : chartColors.DATASET.backgroundColor,
        ),
      },
    ],
  };
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);

  const updatedColors = updatedChartData.labels.map((label) => {
    return label === config.access_types.BROWSER
      ? colors.FILE.backgroundColor
      : colors.DATASET.backgroundColor;
  });
  updatedChartData.datasets[0].backgroundColor = updatedColors;

  chartData.value = updatedChartData;
});

onMounted(() => {
  StatisticsService.getDataAccessCountGroupedByAccessMethod()
    .then((res) => {
      chartData.value = configureChartData(res.data);
    })
    .catch((err) => {
      console.log("Unable to retrieve data access counts by type", err);
      toast.error("Unable to retrieve data access counts by type");
    });
});
</script>
