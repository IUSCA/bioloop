import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import alertService from "@/services/alert";

export const useAlertStore = defineStore("alert", () => {
  const alerts = ref([]);
  const dismissedAlerts = useLocalStorage("dismissedAlerts", {});

  async function fetchAlerts() {
    try {
      const response = await alertService.getAll();
      alerts.value = response.data.alerts;
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  }

  function dismissAlert(alertId) {
    dismissedAlerts.value[alertId] = true;
  }

  function isAlertDismissed(alertId) {
    return !!dismissedAlerts.value[alertId];
  }

  function getNonDismissedAlerts() {
    return alerts.value.filter((alert) => !isAlertDismissed(alert.id));
  }

  return {
    alerts,
    dismissedAlerts,
    fetchAlerts,
    dismissAlert,
    getNonDismissedAlerts,
  };
});
