<template>
  <va-alert
    class="w-full"
    :icon="props.showIcon && icon"
    :color="
      props.type === 'ERROR'
        ? 'danger'
        : props.type === 'WARNING'
          ? 'warning'
          : 'info'
    "
    :title="props.label"
  >
    {{ props.message }}
  </va-alert>
</template>

<script setup>
const props = defineProps({
  active: {
    type: Boolean,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  message: {
    type: String,
  },
  global: {
    type: Boolean,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
  },
  // todo - hide icon at small screens
  showIcon: {
    type: Boolean,
    default: true,
  },
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

<style scoped></style>
