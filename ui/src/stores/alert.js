import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import alertService from "@/services/alert";
import { mapValues } from "@/services/utils";

export const useAlertStore = defineStore("alert", () => {
  // Any active alerts that have been created in the system
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
      console.log("filters changed, updating refObject");
      console.log("new filters:", newFilters);
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
      type: null,
      start_time: null,
      end_time: null,
      // is_active: null,
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
      // inclusive_query: null,
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
    // const currentTime = new Date().toISOString();
    try {
      const response = await alertService.getAll({
        active: true,
      });
      alerts.value = response.data.alerts;
      // alerts.value = []
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

  // async function setPollingFrequency(frequency) {
  //   pollingFrequency.value = frequency;
  //   if (pollingInterval.value) {
  //     stopPolling();
  //     await startPolling();
  //   }
  // }

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
    isAlertDismissed,
    startPolling,
    stopPolling,
    // setPollingFrequency,
  };
});
