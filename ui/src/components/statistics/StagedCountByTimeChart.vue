<template>
  <div class="flex flex-col gap-5">
    <div>
      <v-chart
        :option="lineChartOption"
        autoresize
        style="height: 500px; width: 100%"
      />
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
import { LineChart } from "echarts/charts";
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
const chartData = ref({ dates: [], counts: [] }); // Initialize with empty arrays

const MONTH_DIFFERENCE = 3;

const lineChartOption = computed(() => {
  return {
    title: {
      text: "Stage Requests Per Day",
      left: "center",
      textStyle: {
        fontSize: 18,
      },
    },
    tooltip: {
      trigger: "axis",
    },
    xAxis: {
      type: "category",
      data: chartData.value.dates,
      name: "Date", // X-axis title
      nameLocation: "middle",
      nameGap: 50, // Increase the gap between axis title and axis line
      nameTextStyle: {
        fontSize: 16, // Increase font size
        fontWeight: "bold", // Make it bold
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      name: "Requests", // X-axis title
      nameLocation: "middle",
      nameGap: 50, // Increase the gap between axis title and axis line
      nameTextStyle: {
        fontSize: 16, // Increase font size
        fontWeight: "bold", // Make it bold
      },
    },
    series: [
      {
        name: "Count",
        type: "line",
        data: chartData.value.counts,
        smooth: true,
      },
    ],
  };
});

const configureChartData = (data) => {
  // Function to format date as YYYY-MM-DD
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toISOString().split("T")[0]; // Format date as YYYY-MM-DD
  };

  // Process data to remove the 'T00:00:00.000Z' part
  const processedData = data.map((item) => ({
    date: formatDate(item.date),
    count: item.count,
  }));

  // Prepare the data for the chart
  chartData.value.dates = processedData.map((item) => item.date);
  chartData.value.counts = processedData.map((item) => item.count);
};

const retrieveAndConfigureChartData = (startDate, endDate) => {
  StatisticsService.getStageRequestCountGroupedByDate(startDate, endDate)
    .then((res) => configureChartData(res.data))
    .catch((err) => {
      console.log("Unable to retrieve stage request counts by date", err);
      toast.error("Unable to retrieve stage request counts by date");
    });
};

onMounted(() => {
  // retrieve the range of dates for which to retrieve staging request logs
  StatisticsService.getStageRequestTimestampRange()
    .then((res) => {
      const minStageRequestDate = res.data[0].min_timestamp
        ? new Date(Date.parse(res.data[0].min_timestamp))
        : new Date();
      const maxStageRequestDate = res.data[0].max_timestamp
        ? new Date(Date.parse(res.data[0].max_timestamp))
        : new Date();

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

<style scoped>
.chart {
  height: 500px;
  width: 100%;
}
</style>
