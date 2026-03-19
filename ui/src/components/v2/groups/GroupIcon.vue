<template>
  <Icon :icon="icon" :class="[' rounded-lg p-1.5', colorClass, sizeClass]" />
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  group: {
    type: Object,
    required: true,
  },
  size: {
    type: String,
    default: "base", // xs, sm, base, lg
  },
});

const iconMap = {
  lab: "mdi-flask",
  project: "mdi-folder-multiple",
  center: "mdi-domain",
  core: "mdi-microscope",
  default: "mdi-account-group",
};

const sizeMap = {
  xs: "w-6 h-6 text-xs",
  sm: "w-7 h-7 text-sm",
  base: "w-9 h-9 text-base",
  lg: "w-12 h-12 text-lg",
};

const colorMap = {
  lab: "text-teal-600 bg-teal-100 dark:text-teal-300 dark:bg-teal-900/40",
  project:
    "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40",
  center:
    "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40",
  core: "text-rose-600 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
  default: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40",
};

const icon = computed(() => {
  const type = props.group?.metadata?.type || "default";
  return iconMap[type] || iconMap.default;
});

const colorClass = computed(() => {
  const type = props.group?.metadata?.type || "default";
  return colorMap[type] || colorMap.default;
});

const sizeClass = computed(() => {
  return sizeMap[props.size] || sizeMap.base;
});
</script>
