<template>
  <div class="flex flex-col gap-5">
    <div>
      <LineChart
        :chart-data="chartData"
        :chart-options="chartOptions"
      ></LineChart>
    </div>
    <div class="flex flex-row justify-center">
      <div class="max-w-max" v-if="isDateRangeLoaded">
        <DateRangeShifter
          :start-date="startDate"
          :end-date="endDate"
          :shift-by="3"
          :enable-jump-to-range-extremes="true"
          :start-date-min="startDateMin"
          :end-date-max="endDateMax"
          @date-range-changed="
            (updatedDates) =>
              retrieveAndConfigureChartData(
                updatedDates.startDate,
                updatedDates.endDate,
              )
          "
        ></DateRangeShifter>
      </div>
    </div>
  </div>
</template>

<script setup>
import dayjs from "dayjs";
import "chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm";
import "dayjs/locale/en";
import StatisticsService from "@/services/statistics";
import { getDefaultChartColors } from "@/services/charts";
import { date } from "@/services/datetime";
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

// Date range will be shifted backwards or forwards by this many months, when user clicks the appropriate button
const MONTH_DIFFERENCE = 3;

const endDate = ref();
const startDate = ref();
const endDateMax = ref();
const startDateMin = ref();

const isDateRangeLoaded = ref(false);

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
          return date(arr[0].dataset.data[arr[0].dataIndex].x);
        },
        label: (context) => context.dataset.data[context.dataIndex].y,
      },
    },
    title: {
      display: true,
      text: "Stage Requests Per Day",
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

const configureChartStatistics = (datasets) => {
  return {
    datasets: datasets.map((e) => {
      return {
        data: e.map((log) => ({
          x: log.date,
          y: log.count,
        })),
      };
    }),
  };
};

const retrieveAndConfigureChartData = (startDate, endDate) => {
  StatisticsService.getStageRequestCountGroupedByDate(startDate, endDate)
    .then((res) => {
      chartData.value = configureChartStatistics([res.data]);
      chartData.value.datasets[0].label = "Number of all Stage Requests";

      const chartColors = getDatasetColorsByTheme(isDark.value);
      chartData.value.datasets[0].backgroundColor = chartColors.backgroundColor;
      chartData.value.datasets[0].borderColor = chartColors.borderColor;
    })
    .catch((err) => {
      console.log("Unable to retrieve stage request counts by date", err);
      toast.error("Unable to retrieve stage request counts by date");
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
  // retrieve the range of dates for which to retrieve staging request logs
  StatisticsService.getStageRequestTimestampRange()
    .then((res) => {
      const minStageRequestDate = new Date(
        Date.parse(res.data[0].min_timestamp),
      );
      const maxStageRequestDate = new Date(
        Date.parse(res.data[0].max_timestamp),
      );

      endDate.value = maxStageRequestDate;
      endDateMax.value = maxStageRequestDate;

      startDateMin.value = minStageRequestDate;
      startDate.value = dayjs(endDate.value)
        .subtract(MONTH_DIFFERENCE, "month")
        .toDate();
      if (startDate.value.getTime() < startDateMin.value.getTime()) {
        startDate.value = startDateMin.value;
      }

      retrieveAndConfigureChartData(startDate.value, endDate.value);
    })
    .catch((err) => {
      console.log("Unable to retrieve stage request timestamp range", err);
      toast.error("Unable to retrieve stage request timestamp range");
    })
    .finally(() => {
      isDateRangeLoaded.value = true;
    });
});
</script>
