<template>
  <template v-for="(alert, index) in nonDismissedAlerts" :key="alert.id">
    <Alert
      :type="alert.type"
      :message="alert.message"
      :label="alert.label"
      @close="dismissAlert(alert.id)"
      class=""
    />
    <va-divider v-if="index < nonDismissedAlerts.length - 1" class="divider" />
  </template>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";

const alertStore = useAlertStore();

const { getNonDismissedAlerts, dismissAlert } = alertStore;

const nonDismissedAlerts = computed(() => getNonDismissedAlerts());
</script>

<style scoped>
.divider {
  --va-divider-margin: 0;
}
</style>
