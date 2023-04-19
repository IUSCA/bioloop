<template>
  <div class="flex flex-row gap-4">
    <div
      v-for="(metric, i) in disk_usage_metrics"
      :key="i"
      class="flex-[0_0_13rem]"
    >
      <va-card>
        <va-card-content>
          <div class="flex flex-col gap-2">
            <div class="self-center">
              <Icon
                :icon="getIcon(metric.measurement)"
                class="text-5xl text-slate-600 rounded p-1"
              />
            </div>

            <div class="py-3 self-center">
              <span class="uppercase">
                {{ metric.measurement }}
              </span>
            </div>

            <div>
              <div class="pb-1">
                <span class="va-text-secondary">
                  {{
                    metric.measurement.includes("files")
                      ? metric.usage
                      : formatBytes(metric.usage)
                  }}
                  /
                  {{
                    metric.measurement.includes("files")
                      ? metric.limit
                      : formatBytes(metric.limit)
                  }}
                </span>
              </div>
              <va-progress-bar
                :model-value="getPercent(metric)"
                :color="getProgressBarColor(getPercent(metric))"
              >
              </va-progress-bar>
            </div>
          </div>
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup>
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import MetricService from "@/services/metrics";

const disk_usage_metrics = ref([]);

// const stats = ref({
//   sequencing_runs: 100,
//   data_products: 100,
// });

const fields_obj = (fields) =>
  fields.reduce((acc, curr) => Object.assign(acc, curr), {});

MetricService.getLatest()
  .then((res) => {
    console.log(res.data);
    disk_usage_metrics.value = res.data.map((m) => ({
      ...m,
      ...fields_obj(m.fields),
    }));
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch disk usage metrics");
  });

function getPercent(metric) {
  return (metric.usage / metric.limit) * 100;
}

function getProgressBarColor(usage_percent) {
  const themeColors = ["success", "primary", "info", "warning", "danger"];
  const clipped = Math.min(0, Math.max(99, usage_percent));
  const idx = Math.floor(clipped / 20);
  return themeColors[idx];
}

function getIcon(name) {
  if (name.includes("files")) {
    return "mdi-file-multiple";
  }
  const icon_map = {
    SDA: "mdi-tape-drive",
    "/N/SCRATCH": "mdi-nas",
  };
  const default_icon = "mdi-harddisk";
  return icon_map[name.toUpperCase()] || default_icon;
}
</script>
