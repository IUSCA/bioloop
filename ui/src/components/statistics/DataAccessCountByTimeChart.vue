<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-row justify-between">
      <div class="w-1/2">
        <v-chart
          v-if="!isLoading && !isNoData"
          :option="lineChartOption"
          autoresize
          style="height: 500px; width: 100%"
        />
        <div
          v-else-if="isLoading"
          class="flex items-center justify-center"
          style="height: 500px; width: 100%; font-size: 24px"
        >
          Loading...
        </div>
        <div
          v-else
          class="flex items-center justify-center"
          style="height: 500px; width: 100%; font-size: 24px"
        >
          No Data Found
        </div>
      </div>
      <div class="w-1/2">
        <v-chart
          v-if="!isLoading && !isNoData"
          :option="pieChartOption"
          autoresize
          style="height: 500px; width: 100%"
        />
        <div
          v-else-if="isLoading"
          class="flex items-center justify-center"
          style="height: 500px; width: 100%; font-size: 24px"
        >
          Loading...
        </div>
        <div
          v-else
          class="flex items-center justify-center"
          style="height: 500px; width: 100%; font-size: 24px"
        >
          No Data Found
        </div>
      </div>
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
import StatisticsService from "@/services/statistics";
import toast from "@/services/toast";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { LineChart, PieChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, onMounted, ref } from "vue";
import VChart from "vue-echarts";

// Register ECharts components
use([
  CanvasRenderer,
  LineChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
]);

const endDate = ref();
const startDate = ref();
const endDateMax = ref();
const startDateMin = ref();
const isDateRangeLoaded = ref(false);
const chartData = ref({});
const isLoading = ref(true); // Track the loading state
const isNoData = ref(false); // Track if data is empty

const MONTH_DIFFERENCE = 3;

const lineChartOption = computed(() => {
  return {
    title: {
      text: "Data Access Requests Per Day",
      left: "center",
      textStyle: {
        fontSize: 18,
      },
    },
    tooltip: {
      trigger: "axis",
    },
    legend: {
      data: [
        "Total Number of Data Accesses",
        "Number of Browser Data Accesses",
        "Number of Slate-Scratch Data Accesses",
      ],
      left: "center",
      top: "10%", // Move the legend down to make space for the pie chart
      // Set initial selection status for the lines
      selected: {
        "Total Number of Data Accesses": false, // Initially hide the total count
        "Number of Browser Data Accesses": true, // Initially show browser access
        "Number of Slate-Scratch Data Accesses": true, // Initially show slate scratch access
      },
    },
    xAxis: {
      type: "category",
      name: "Date",
      nameLocation: "middle",
      nameGap: 30, // Gap between axis name and axis line
      nameTextStyle: {
        fontSize: 16, // Increase font size
        fontWeight: "bold", // Make it bold
      },
      data: chartData.value.dates || [],
    },
    yAxis: {
      type: "value",
      min: 0,
      name: "No.of Requests",
      nameLocation: "middle",
      nameGap: 30, // Gap between axis name and axis line
      nameTextStyle: {
        fontSize: 16, // Increase font size
        fontWeight: "bold", // Make it bold
      },
    },
    grid: {
      top: "20%", // Push the grid down to make space for the pie chart
    },
    series: [
      {
        name: "Total Number of Data Accesses",
        type: "line",
        data: chartData.value.totalCounts || [],
        smooth: true,
      },
      {
        name: "Number of Browser Data Accesses",
        type: "line",
        data: chartData.value.browserCounts || [],
        smooth: true,
      },
      {
        name: "Number of Slate-Scratch Data Accesses",
        type: "line",
        data: chartData.value.slateScratchCounts || [],
        smooth: true,
      },
    ],
  };
});

const pieChartOption = computed(() => {
  return {
    title: {
      text: `Total Access count: ${totalAccessCount.value}`,
      left: "center",
    },
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    legend: {
      orient: "vertical",
      left: "right",
    },
    series: [
      {
        name: "Access Type",
        type: "pie",
        radius: "70%", // Adjust the size of the pie chart
        center: ["50%", "50%"], // Position the pie chart at the top
        data: chartData.value.pieData || [],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };
});

const configureChartData = (data) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
  };

  const dates = [...new Set(data.map((item) => formatDate(item.date)))];

  const browserData = dates.map((date) => {
    const record = data.find(
      (item) =>
        formatDate(item.date) === date && item.access_type === "BROWSER",
    );
    return record ? record.count : 0;
  });

  const slateScratchData = dates.map((date) => {
    const record = data.find(
      (item) =>
        formatDate(item.date) === date && item.access_type === "SLATE_SCRATCH",
    );
    return record ? record.count : 0;
  });

  const totalBrowserCount = data
    .filter((item) => item.access_type === "BROWSER")
    .reduce((sum, item) => sum + item.count, 0);

  const totalSlateScratchCount = data
    .filter((item) => item.access_type === "SLATE_SCRATCH")
    .reduce((sum, item) => sum + item.count, 0);

  // Check if the data is empty
  if (
    data.length === 0 ||
    (totalBrowserCount === 0 && totalSlateScratchCount === 0)
  ) {
    isNoData.value = true; // No data available
  } else {
    isNoData.value = false; // Data exists
  }

  chartData.value = {
    dates,
    totalCounts: dates.map(
      (date) =>
        browserData[dates.indexOf(date)] +
        slateScratchData[dates.indexOf(date)],
    ),
    browserCounts: browserData,
    slateScratchCounts: slateScratchData,
    pieData: [
      { value: totalBrowserCount, name: "BROWSER" },
      { value: totalSlateScratchCount, name: "SLATE_SCRATCH" },
    ],
  };
  isLoading.value = false; // Data has been loaded, stop loading state
};

const totalAccessCount = computed(() => {
  const browserCount =
    chartData.value.pieData?.find((item) => item.name === "BROWSER")?.value ||
    0;
  const slateScratchCount =
    chartData.value.pieData?.find((item) => item.name === "SLATE_SCRATCH")
      ?.value || 0;
  return browserCount + slateScratchCount;
});

const retrieveAndConfigureChartData = (startDate, endDate) => {
  isLoading.value = true; // Start loading state before fetching data
  StatisticsService.getDataAccessCountGroupedByDate(startDate, endDate, true)
    .then((res) => configureChartData(res.data))
    .catch((err) => {
      console.log("Unable to retrieve data access counts by date", err);
      toast.error("Unable to retrieve data access counts by date");
      isLoading.value = false; // Stop loading state even if an error occurs
      isNoData.value = true; // Assume no data if error occurs
    });
};

onMounted(() => {
  StatisticsService.getDataAccessTimestampRange()
    .then((res) => {
      const minDataAccessDate = res.data[0].min_timestamp
        ? new Date(Date.parse(res.data[0].min_timestamp))
        : new Date();
      const maxDataAccessDate = res.data[0].max_timestamp
        ? new Date(Date.parse(res.data[0].max_timestamp))
        : new Date();

      endDate.value = maxDataAccessDate;
      endDateMax.value = maxDataAccessDate;

      startDateMin.value = minDataAccessDate;
      startDate.value = dayjs(endDate.value)
        .subtract(MONTH_DIFFERENCE, "month")
        .toDate();
      if (startDate.value.getTime() < startDateMin.value.getTime()) {
        startDate.value = startDateMin.value;
      }

      retrieveAndConfigureChartData(startDate.value, endDate.value);
    })
    .catch((err) => {
      console.log("Unable to retrieve data access timestamp range", err);
      toast.error("Unable to retrieve data access timestamp range");
    })
    .finally(() => {
      isDateRangeLoaded.value = true;
    });
});
</script>

<style scoped>
.chart {
  height: 500px;
  width: 100%;
}
</style>
