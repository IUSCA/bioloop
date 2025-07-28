<template>
  <va-alert
    v-model="isVisible"
    class="y-padding-0 w-full square-corners bold-title"
    :icon="alertService.getAlertIcon(props.type)"
    :color="alertService.getAlertColor(props.type)"
    :title="props.label"
    :closeable="props.dismissable"
    dense
  >
    {{ props.message }}
  </va-alert>
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

const isVisible = ref(true);

watch(isVisible, (newValue) => {
  if (!newValue) {
    console.log("Alert closed");
    emit("close");
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
