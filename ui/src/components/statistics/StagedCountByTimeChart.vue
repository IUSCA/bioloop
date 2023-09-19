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
import { subMonths, parse } from "date-fns";
import "chartjs-adapter-date-fns";
import { enUS } from "date-fns/locale";
import StatisticsService from "@/services/statistics";
import { getDefaultChartColors } from "@/services/charts";
import { dateTimeToFormattedDate } from "@/services/datetime";
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

// Date range will be shifted backwards or forwards by this many months, when user clicks the appropriate button
const MONTH_DIFFERENCE = 3;
const DATE_FORMAT = "yyyy-MM-dd";

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
          // Chart.js uses date-fns for attempting dateTime-to-formatted-date conversion, which
          // parses the date string as localized date, which can potentially result in date
          // discrepancies. This is avoided by taking control of the date format through the
          // 'title' callback
          return dateTimeToFormattedDate(
            arr[0].dataset.data[arr[0].dataIndex].x,
          );
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
      return res.data.map((e) => ({
        ...e,
        count: e.count,
      }));
    })
    .then((data) => {
      chartData.value = configureChartStatistics([data]);
      chartData.value.datasets[0].label = "Number of all Stage Requests";

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
  // retrieve the range of dates for which to retrieve download logs
  StatisticsService.getStageRequestTimestampRange()
    .then((res) => {
      // https://date-fns.org/v2.30.0/docs/parse
      const minDownloadDate = parse(
        res.data[0].min_timestamp.substring(0, 10), // ignore time
        DATE_FORMAT,
        new Date(),
      );
      const maxDownloadDate = parse(
        res.data[0].max_timestamp.substring(0, 10), // ignore time
        DATE_FORMAT,
        new Date(),
      );

      endDate.value = maxDownloadDate;
      endDateMax.value = maxDownloadDate;

      startDateMin.value = minDownloadDate;
      startDate.value = subMonths(endDate.value, MONTH_DIFFERENCE);
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
