import { defineStore } from "pinia";
import alertService from "@/services/alert";

export const useAlertStore = defineStore("alert", {
  state: () => ({
    alerts: [],
  }),
  actions: {
    async fetchAlerts() {
      const response = await alertService.getAll();
      this.alerts = response.data.alerts;
    },
    getAlertsForPage(pageName) {
      return this.alerts.filter(
        (alert) =>
          alert.pages.includes(pageName) &&
          alert.active &&
          (!alert.startTime || new Date(alert.startTime) <= new Date()) &&
          (!alert.endTime || new Date(alert.endTime) > new Date()),
      );
    },
  },
});
