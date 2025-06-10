<template>
  <va-alert
    v-model="isVisible"
    class="y-padding-0 w-full square-corners bold-title"
    :icon="props.showIcon && icon"
    :color="
      props.type === 'ERROR'
        ? 'danger'
        : props.type === 'WARNING'
          ? 'warning'
          : 'info'
    "
    :title="props.label"
    closeable
    dense
  >
    {{ props.message }}
  </va-alert>
</template>

<script setup>
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
  icon: {
    type: String,
  },
  showIcon: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["close"]);

const isVisible = ref(true);

watch(isVisible, (newValue) => {
  if (!newValue) {
    console.log("Alert closed");
    emit("close");
  }
});

const icon = computed(() => {
  if (props.icon) {
    return props.icon;
  }

  switch (props.type) {
    case "ERROR":
      return "warning";
    case "WARNING":
      return "warning";
    case "INFO":
      return "info";
    default:
      return null;
  }
});
</script>

<style scoped>
.y-padding-0 {
  --va-alert-margin-y: 0;
}

.square-corners {
  border-radius: 0;
}

.bold-title :deep(.va-alert__title) {
  font-weight: bold;
}
</style>
