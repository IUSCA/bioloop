<template>
  <div class="flex flex-row gap-4 overflow-x-scroll h-[217px]">
    <div
      v-for="(metric, i) in disk_usage_metrics"
      :key="i"
      class="flex-[0_0_13rem]"
    >
      <StorageCard :metric="metric" />
    </div>
  </div>
</template>

<script setup>
import MetricService from "@/services/metrics";
import toast from "@/services/toast";

const disk_usage_metrics = ref([]);

MetricService.getLatest()
  .then((res) => {
    disk_usage_metrics.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch disk usage metrics");
  });
</script>
