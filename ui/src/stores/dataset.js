import { mapValues } from "@/services/utils";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useDatasetStore = defineStore("dataset", () => {
  function defaultFilters() {
    return {
      deleted: false,
      archived: null,
      staged: null,
      has_workflows: null,
      has_derived_data: null,
      has_source_data: null,
      name: null,
      created_at: null,
      updated_at: null,
      metaData: {}
    };
  }

  function defaultQuery() {
    return {
      page: 1,
      page_size: 25,
      sort_by: "created_at",
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

  function resetFilterByKey(key, metaData = false) {
    const defaults = defaultFilters();
    // console.log("resetting", key, params.value.filters[key], defaults[key]);

    if (metaData) {
      delete params.value.filters.metaData[key]
    } else {
      params.value.filters[key] = defaults[key];
    }
  }

  const filterStatus = computed(() => {
    const defaults = defaultFilters();
    return mapValues(
      params.value.filters,
      (key, value) => {
        console.log(key, value, defaults[key]);
        if (key === 'metaData' && Object.keys(params.value.filters.metaData).length === 0) {
          return false;
        }
        return value !== defaults[key];
      }
    );
  });

  const activeFilters = computed(() => {
    return Object.keys(filterStatus.value).filter(
      (key) => {
        if (key === "metaData" && Object.keys(params.value.filters.metaData).length > 0) {
          return filterStatus.value[key] 
        }
        return filterStatus.value[key] 
      }
    );
  });

  function reset() {
    resetFilters();
    resetQuery();
  }

  const type = ref("");
  function setType(newType) {
    type.value = newType;
  }


  return {
    params,
    filters,
    query,
    filterStatus,
    activeFilters,
    type,
    setType,
    defaultFilters,
    defaultQuery,
    defaultParams,
    reset,
    resetFilters,
    resetFilterByKey,
  };
});
