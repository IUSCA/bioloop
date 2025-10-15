<template>
  <div v-if="displayedAlerts.length > 0" class="w-full space-y-2">
    <Alert
      v-for="alert in displayedAlerts"
      :key="alert.id"
      :alert="alert"
      @close="() => handleDismiss(alert.id)"
    />
  </div>
</template>

<script setup>
import config from "@/config";
import { useAlertStore } from "@/stores/alert";

const alertStore = useAlertStore();

const { getNonDismissedAlerts, dismissAlert } = alertStore;

const nonDismissedAlerts = computed(() => getNonDismissedAlerts());

// filter alerts by whether they are hidden
const visibleAlerts = computed(() => {
  return nonDismissedAlerts.value.filter((alert) => !alert.is_hidden);
});

// Sort alerts by severity (ERROR > WARNING > INFO) and then by timestamp (newest first)
const sortedAlerts = computed(() => {
  const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };

  return [...visibleAlerts.value].sort((a, b) => {
    // First sort by severity
    const severityDiff = severityOrder[a.type] - severityOrder[b.type];
    if (severityDiff !== 0) return severityDiff;
    // Then sort by created_at timestamp (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });
});

// Show configurable number of alerts based on config
const displayedAlerts = computed(() => {
  const maxCount = config.alerts?.maxDisplayCount || 1;
  return sortedAlerts.value.slice(0, maxCount);
});

const handleDismiss = (alertId) => {
  dismissAlert(alertId);
};
</script>

<style scoped>
</style>
