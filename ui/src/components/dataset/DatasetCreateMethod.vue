<template>
  <div class="flex items-center">
    <Icon
      :icon="CREATE_METHOD_CONFIG[props.createMethod]?.icon"
      class="text-2xl flex-none mr-2 va-text-secondary"
    />
    <span>{{ CREATE_METHOD_CONFIG[props.createMethod]?.label }}</span>
    <va-popover v-if="tooltipParts" placement="right">
      <template #body>
        <div class="w-96">
          {{ tooltipParts.prefix
          }}<code
            class="mx-1 px-1 rounded text-sm font-mono bg-black/10 dark:bg-white/10"
            >{{ props.originPath ?? "(unknown path)" }}</code
          >{{ tooltipParts.suffix }}
        </div>
      </template>
      <va-icon
        name="info_outline"
        size="small"
        class="ml-1 va-text-secondary cursor-help"
      />
    </va-popover>
  </div>
</template>

<script setup>
import { Icon } from "@iconify/vue";
import { computed } from "vue";

const props = defineProps({
  createMethod: {
    type: String,
    required: true,
  },
  /** dataset.origin_path — used to build tooltip text for non-Upload methods */
  originPath: {
    type: String,
    default: null,
  },
});

const CREATE_METHOD_CONFIG = {
  UPLOAD: { icon: "mdi-cloud-upload-outline", label: "Upload" },
  IMPORT: { icon: "mdi-file-import-outline", label: "Import" },
  SCAN: { icon: "mdi-radar", label: "Scan" },
  ON_DEMAND: { icon: "mdi-gesture-tap", label: "On Demand" },
};

// Each entry is { prefix, suffix } — the path is rendered as <code> between them.
const TOOLTIP_PARTS = {
  IMPORT: {
    prefix: "Directory ",
    suffix: " was selected for registration, using the web-portal",
  },
  SCAN: {
    prefix: "Directory ",
    suffix:
      " was found to be eligible for registration by Bioloop's automated-watchers",
  },
  ON_DEMAND: { prefix: "Directory ", suffix: " was registered via scripting" },
};

const tooltipParts = computed(() => TOOLTIP_PARTS[props.createMethod] ?? null);
</script>
