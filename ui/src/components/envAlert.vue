<template>
  <va-alert v-if="showEnv" :icon="props.icon" :color="props.color" dense>
    Mode: {{ _env }}
  </va-alert>
</template>

<script setup>
import config from "@/config";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  color: {
    type: String,
    default: "warning",
  },
  icon: {
    type: String,
    default: "info",
  },
});

const auth = useAuthStore();
const { env } = storeToRefs(auth);

const _env = computed(() =>
  env.value === "ci"
    ? env.value.toUpperCase()
    : env.value[0].toUpperCase() + env.value.slice(1),
);

const showEnv = computed(() => {
  return config.alertForEnvironments.includes(env.value);
});
</script>

<style scoped></style>
