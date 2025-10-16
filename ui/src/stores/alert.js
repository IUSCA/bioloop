import constants from "@/constants";
import alertService from "@/services/alert";
import { mapValues } from "@/services/utils";
import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";

export const useAlertStore = defineStore("alert", () => {
  // Any alerts that have been created in the system
  const alerts = ref([]);

  // Alerts which are not currently shown in the portal, since they have been dismissed by the current user
  const dismissedAlerts = useLocalStorage("dismissedAlerts", {});

  // Parameters related to the current search and sorting
  const params = ref(defaultParams());

  // Polling related state
  const pollingInterval = ref(null);
  const pollingFrequency = ref(5000); // 1 minute by default

  const filters = computed({
    get: () => params.value.filters,
    set: (newFilters) => {
      params.value.filters = newFilters;
    },
  });

  const query = computed({
    get: () => params.value.query,
    set: (newQuery) => {
      params.value.query = newQuery;
    },
  });

  const filterStatus = computed(() => {
    const defaults = defaultFilters();
    return mapValues(
      params.value.filters,
      (key, value) => value !== defaults[key],
    );
  });

  const activeFilters = computed(() => {
    return Object.keys(filterStatus.value).filter(
      (key) => filterStatus.value[key],
    );
  });

  function defaultFilters() {
    return {
      is_hidden: null,
      type: null,
      start_time: null,
      end_time: null,
      status: null,
    };
  }

  function defaultQuery() {
    return {
      page: 1,
      pageSize: 10,
      sort_by: "created_at",
      sort_order: "desc",
    };
  }

  function defaultParams() {
    return {
      filters: defaultFilters(),
      query: defaultQuery(),
    };
  }

  function resetFilters() {
    params.value.filters = defaultFilters();
  }

  function resetQuery() {
    params.value.query = defaultQuery();
  }

  function resetFilterByKey(key) {
    const defaults = defaultFilters();
    params.value.filters[key] = defaults[key];
  }

  function reset() {
    resetFilters();
    resetQuery();
  }

  async function fetchAlerts() {
    try {
      const response = await alertService.getAll({
        is_hidden: false,
        status: constants.alerts.statuses.ACTIVE,
      });
      alerts.value = response.data.alerts;
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  }

  async function startPolling() {
    if (!pollingInterval.value) {
      try {
        await fetchAlerts();
      } catch (error) {
        console.error("Initial fetch failed:", error);
      }

      pollingInterval.value = setInterval(async () => {
        try {
          await fetchAlerts();
        } catch (error) {
          console.error("Polling fetch failed:", error);
        }
      }, pollingFrequency.value);
    }
  }

  function stopPolling() {
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
    }
  }

  function dismissAlert(alertId) {
    dismissedAlerts.value[alertId] = {
      dismissed_at: new Date().toISOString(),
    };
  }

  /**
   * Determines if an alert has been dismissed and is still considered dismissed.
   *
   * An alert is considered dismissed if:
   * 1. It has been dismissed by the user, AND
   * 2. The alert not been updated since it was dismissed
   *
   * @param {Object} alert - The alert object to check.
   * @param {string} alert.id - The unique identifier of the alert.
   * @param {string} alert.updated_at - The ISO 8601 timestamp of when the alert was last updated.
   * @returns {boolean} True if the alert is currently dismissed, false otherwise.
   */
  function isAlertDismissed(alert) {
    const dismissalInfo = dismissedAlerts.value[alert.id];
    if (!dismissalInfo) return false;

    const dismissedAt = new Date(dismissalInfo.dismissed_at);
    const updatedAt = new Date(alert.updated_at);

    return dismissedAt > updatedAt;
  }

  function getNonDismissedAlerts() {
    return alerts.value.filter((alert) => !isAlertDismissed(alert));
  }

  function getDismissedAlerts() {
    return alerts.value.filter((alert) => isAlertDismissed(alert));
  }

  return {
    alerts,
    dismissedAlerts,
    params,
    filters,
    query,
    filterStatus,
    activeFilters,
    defaultFilters,
    defaultQuery,
    defaultParams,
    reset,
    resetFilters,
    resetFilterByKey,
    fetchAlerts,
    dismissAlert,
    getNonDismissedAlerts,
    getDismissedAlerts,
    isAlertDismissed,
    startPolling,
    stopPolling,
  };
});
