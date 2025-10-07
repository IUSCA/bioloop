<template>
  <div
    class="flex items-center justify-center gap-3 px-4 py-2 w-full"
    :class="getAlertClasses(props.type)"
  >
    <va-icon
      :name="alertService.getAlertIcon(props.type)"
      :color="getIconColor(props.type)"
      size="1.25rem"
    />
    <div class="flex-1 text-center" v-html="props.message || props.label"></div>
    <va-button
      v-if="props.dismissable"
      preset="plain"
      size="small"
      icon="close"
      @click="handleClose"
      class="flex-shrink-0"
    />
  </div>
</template>

<script setup>
import alertService from "@/services/alert";

const props = defineProps({
  label: {
    type: String,
    required: true,
  },
  message: {
    type: String,
  },
  type: {
    type: String,
    required: true,
  },
  dismissable: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["close"]);

const handleClose = () => {
  emit("close");
};

const getAlertClasses = (type) => {
  switch (type) {
    case "ERROR":
      return "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-l-4 border-red-500";
    case "WARNING":
      return "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-l-4 border-amber-500";
    case "INFO":
      return "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border-l-4 border-blue-500";
    default:
      return "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border-l-4 border-blue-500";
  }
};

const getIconColor = (type) => {
  switch (type) {
    case "ERROR":
      return "#ef4444";
    case "WARNING":
      return "#f59e0b";
    case "INFO":
      return "#3b82f6";
    default:
      return "#3b82f6";
  }
};
</script>

<style scoped>
</style>
