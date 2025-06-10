<template>
  <Alert
    v-for="alert in nonDismissedAlerts"
    :key="alert.id"
    :type="alert.type"
    :message="alert.message"
    :label="alert.label"
    @close="dismissAlert(alert.id)"
  />
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";

const alertStore = useAlertStore();

const { getNonDismissedAlerts, dismissAlert } = alertStore;

const nonDismissedAlerts = computed(() => getNonDismissedAlerts());
</script>
