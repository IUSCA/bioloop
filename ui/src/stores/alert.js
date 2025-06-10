import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import alertService from "@/services/alert";
import { mapValues } from "@/services/utils";

export const useAlertStore = defineStore("alert", () => {
  const alerts = ref([]);
  const dismissedAlerts = useLocalStorage("dismissedAlerts", {});

  function defaultFilters() {
    return {
      active: null,
      type: null,
      created_at: null,
    };
  }

  function defaultQuery() {
    return {
      page: 1,
      pageSize: 10,
      sortBy: "created_at",
      sortingOrder: "desc",
    };
  }

  function defaultParams() {
    return {
      filters: defaultFilters(),
      query: defaultQuery(),
      inclusive_query: null,
    };
  }

  const params = ref(defaultParams());

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

  function reset() {
    resetFilters();
    resetQuery();
  }

  async function fetchAlerts() {
    try {
      const response = await alertService.getAll();
      alerts.value = response.data.alerts;
      // alerts.value = []
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
  };
});
