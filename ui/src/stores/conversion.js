import { mapValues } from "@/services/utils";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useConversionStore = defineStore("conversion", () => {
  function defaultFilters() {
    return {
      dataset_name: null,
      definition_name: null,
      program_name: null,
      initiator: null,
      initiated_at: null,
    };
  }

  function defaultQuery() {
    return {
      page: 1,
      page_size: 25,
      sort_by: "initiated_at",
      sort_order: "desc",
    };
  }

  function defaultParams() {
    return {
      filters: defaultFilters(),
      query: defaultQuery(),
      inclusive_query: null,
    };
  }

  const params = ref({
    filters: defaultFilters(),
    query: defaultQuery(),
  });

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

  return {
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
  };
});
