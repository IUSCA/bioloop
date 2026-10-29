<template>
  <va-card>
    <va-card-content>
      <div class="flex flex-col gap-2">
        <div class="self-center">
          <Icon
            :icon="getIcon(props.metric.measurement)"
            class="text-5xl text-slate-700 dark:text-slate-300 rounded p-1"
          />
        </div>

        <div class="py-3 self-center flex flex-col gap-1 items-center">
          <span class="uppercase">
            {{ props.metric.measurement }}
          </span>
          <span class="va-text-secondary"> {{ props.metric.subject }} </span>
        </div>

        <div>
          <div class="pb-1 text-center">
            <span class="va-text-secondary">
              {{
                props.metric.measurement.includes("files")
                  ? props.metric.usage
                  : formatBytes(props.metric.usage)
              }}
              /
              {{
                props.metric.measurement.includes("files")
                  ? props.metric.limit
                  : formatBytes(props.metric.limit)
              }}
            </span>
          </div>
          <va-progress-bar
            :model-value="getPercent(props.metric)"
            :color="getProgressBarColor(getPercent(props.metric))"
          >
          </va-progress-bar>
        </div>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import { formatBytes } from "@/services/utils";
const props = defineProps({ metric: Object });

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
