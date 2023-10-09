<template>
  <div class="flex flex-col gap-20 my-16">
    <div class="flex flex-row gap-20 flex-wrap">
      <div class="flex-1">
        <DataAccessCountByTimeChart></DataAccessCountByTimeChart>
      </div>
      <div class="flex-1">
        <MostAccessedDataChart></MostAccessedDataChart>
      </div>
    </div>
    <div class="flex flex-row gap-20 flex-wrap">
      <div class="flex-1">
        <StagedCountByTimeChart></StagedCountByTimeChart>
      </div>
      <div class="flex-1">
        <MostStagedDatasetsChart></MostStagedDatasetsChart>
      </div>
    </div>
    <div class="flex flex-row gap-20 flex-wrap">
      <div class="flex-1">
        <DataAccessCountByAccessMethodChart></DataAccessCountByAccessMethodChart>
      </div>
      <div class="flex-1">
        <MetricCountByTimeChart
          :measurement="config.metric_measurements.SDA"
        ></MetricCountByTimeChart>
        <div></div>
      </div>
    </div>
    <div class="flex flex-row gap-20 flex-wrap">
      <div class="flex-1">
        <MetricCountByTimeChart
          :measurement="config.metric_measurements.SLATE_SCRATCH"
        ></MetricCountByTimeChart>
      </div>
      <div class="flex-1">
        <MetricCountByTimeChart
          :measurement="config.metric_measurements.SLATE_SCRATCH_FILES"
        ></MetricCountByTimeChart>
        <div></div>
      </div>
    </div>
    <div class="flex flex-row gap-20 flex-wrap">
      <div class="flex-1">
        <UserBandwidthConsumptionChart></UserBandwidthConsumptionChart>
        <div></div>
      </div>
      <div class="flex-1">
        <UserCountByTimeChart></UserCountByTimeChart>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import config from "@/config";
import _ from "lodash";

const nav = useNavStore();

// set page breadcrumbs
nav.setNavItems([
  {
    label: "Stats/Tracking",
  },
]);
</script>
