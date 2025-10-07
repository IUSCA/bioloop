<template>
  <div v-if="currentAlert" class="w-full">
    <Alert
      :type="currentAlert.type"
      :message="currentAlert.message"
      :label="currentAlert.label"
      @close="handleDismiss"
    />
  </div>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";

const alertStore = useAlertStore();

const { getNonDismissedAlerts, dismissAlert } = alertStore;

const nonDismissedAlerts = computed(() => getNonDismissedAlerts());

// Sort alerts by severity (ERROR > WARNING > INFO) and then by timestamp (newest first)
const sortedAlerts = computed(() => {
  const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };

  return [...nonDismissedAlerts.value].sort((a, b) => {
    // First sort by severity
    const severityDiff = severityOrder[a.type] - severityOrder[b.type];
    if (severityDiff !== 0) return severityDiff;

    // Then sort by created_at timestamp (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });
});

// Show only the highest priority alert
const currentAlert = computed(() => sortedAlerts.value[0] || null);

const handleDismiss = () => {
  if (currentAlert.value) {
    dismissAlert(currentAlert.value.id);
  }
};
</script>

<style scoped>
</style>
