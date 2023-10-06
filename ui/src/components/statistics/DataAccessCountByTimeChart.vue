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
import "chartjs-adapter-date-fns";
import { enUS } from "date-fns/locale";
import StatisticsService from "@/services/statistics";
import { groupByAndAggregate } from "@/services/utils";
import { getDefaultChartColors } from "@/services/charts";
import { date } from "@/services/datetime";
import config from "@/config";
import _ from "lodash";

const isDark = useDark();

const defaultChartColors = computed(() => {
  return getDefaultChartColors(isDark.value);
});

// Date range will be shifted backwards or forwards by this many months, when user clicks the appropriate button
const MONTH_DIFFERENCE = 3;

const endDate = ref();
const startDate = ref();
const endDateMax = ref();
const startDateMin = ref();

const isDateRangeLoaded = ref(false);

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
      text: "Data Access Requests Per Day",
      color: colors.FONT,
      font: {
        size: 18,
      },
    },
  },
});

const getDatasetColorsByTheme = (isDark) => {
  // dark - rgba (74, 77, 83, 1)
  // rgba (201, 203, 207, 1)
  return {
    ALL: {
      backgroundColor: isDark
        ? "rgba(74, 77, 83, 1)"
        : "rgba(201, 203, 207, 1)",
      borderColor: isDark ? "rgba(74, 77, 83, 1)" : "rgba(201, 203, 207, 1)",
    },
    BROWSER: {
      backgroundColor: isDark
        ? "rgba(118, 98, 45, 1)"
        : "rgba(252, 222, 155, 1)",
      borderColor: isDark ? "rgba(118, 98, 45, 1)" : "rgba(252, 222, 155, 1)",
    },
    SLATE_SCRATCH: {
      backgroundColor: isDark
        ? "rgba(35, 92, 95, 1)"
        : "rgba(198, 231, 231, 1)",
      borderColor: isDark ? "rgba(35, 92, 95, 1)" : "rgba(198, 231, 231, 1)",
    },
  };
};

const configureChartDataByDataset = (datasets) => {
  return {
    datasets: datasets.map((dataset) => {
      // individual colors by dataset and theme
      const chartColors = getDatasetColorsByTheme(isDark.value);

      const isAggregatedCounts = _.every(dataset, (e) => !e.access_type);
      const isBrowserAccessCounts = _.every(
        dataset,
        (e) => e.access_type && e.access_type === config.access_types.BROWSER,
      );

      const colors = isAggregatedCounts
        ? chartColors.ALL
        : isBrowserAccessCounts
        ? chartColors.BROWSER
        : chartColors.SLATE_SCRATCH;

      return {
        data: dataset.map((log) => ({
          x: log.date,
          y: log.count,
        })),
        backgroundColor: colors.backgroundColor,
        borderColor: colors.borderColor,
      };
    }),
  };
};

const configureChartData = (data) => {
  // data retrieved is grouped by access_type (BROWSER or SLATE_SCRATCH). For getting total access
  // counts per day, aggregate that day's data across both access types.
  const aggregatedByAccessType = groupByAndAggregate(
    data,
    "date",
    "count",
    (groupedValues) => {
      return groupedValues.length > 1
        ? groupedValues.reduce(
            (accumulator, currentVal) => accumulator.count + currentVal.count,
          )
        : groupedValues[0].count;
    },
    (e) => e.date,
  );

  chartData.value = configureChartDataByDataset([
    aggregatedByAccessType,
    data.filter((e) => e.access_type === config.access_types.BROWSER),
    data.filter((e) => e.access_type === config.access_types.SLATE_SCRATCH),
  ]);

  chartData.value.datasets[0].label = "Total Number of Data Accesses";
  chartData.value.datasets[1].label = "Number of Browser Data Accesses";
  chartData.value.datasets[2].label = "Number of Slate-Scratch Data Accesses";
};

const retrieveAndConfigureChartData = (startDate, endDate) => {
  StatisticsService.getDataAccessCountGroupedByDate(
    startDate,
    endDate,
    true,
  ).then((res) => configureChartData(res.data));
};

watch(isDark, (newIsDark) => {
  const colors = getDatasetColorsByTheme(newIsDark);
  let updatedChartData = _.cloneDeep(chartData.value);
  // update colors for aggregated access counts
  updatedChartData.datasets[0].backgroundColor = [colors.ALL.backgroundColor];
  updatedChartData.datasets[0].borderColor = [colors.ALL.borderColor];
  // update colors for browser access counts
  updatedChartData.datasets[1].backgroundColor = [
    colors.BROWSER.backgroundColor,
  ];
  updatedChartData.datasets[1].borderColor = [colors.BROWSER.borderColor];
  // update colors for Slate-Scratch access counts
  updatedChartData.datasets[2].backgroundColor = [
    colors.SLATE_SCRATCH.backgroundColor,
  ];
  updatedChartData.datasets[2].borderColor = [colors.SLATE_SCRATCH.borderColor];

  chartData.value = updatedChartData;
});

onMounted(() => {
  // retrieve the range of dates for which to retrieve download logs
  StatisticsService.getDataAccessTimestampRange()
    .then((res) => {
      const minDownloadDate = new Date(Date.parse(res.data[0].min_timestamp));
      const maxDownloadDate = new Date(Date.parse(res.data[0].max_timestamp));

      endDate.value = maxDownloadDate;
      endDateMax.value = maxDownloadDate;

      startDateMin.value = minDownloadDate;
      startDate.value = dayjs(endDate.value)
        .subtract(MONTH_DIFFERENCE, "month")
        .toDate();
      if (startDate.value.getTime() < startDateMin.value.getTime()) {
        startDate.value = startDateMin.value;
      }

      isDateRangeLoaded.value = true;
    })
    .then(() => {
      retrieveAndConfigureChartData(startDate.value, endDate.value);
    });
});
</script>
