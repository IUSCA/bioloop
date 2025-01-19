import useQueryPersistence from "@/composables/useQueryPersistence";
import { mapValues } from "@/services/utils";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useFileBrowserStore = defineStore("fileBrowser", () => {
  function defaultFilters() {
    return {
      name: "",
      location: "/",
      filetype: "any",
      extension: "",
      minSize: null,
      maxSize: Infinity,
    };
  }
  const defaults = defaultFilters();

  const pwd = ref("");
  const isInSearchMode = ref(false);
  const filters = ref(defaultFilters());

  const params = computed({
    get: () => {
      // console.log("params computed getting value");
      return {
        pwd: pwd.value,
        isInSearchMode: isInSearchMode.value,
        filters: filters.value,
      };
    },
    set: (newValue) => {
      // console.log("params computed setting new value", newValue);
      pwd.value = newValue.pwd;
      isInSearchMode.value = newValue.isInSearchMode;
      filters.value = newValue.filters;
    },
  });

  useQueryPersistence({
    refObject: params,
    defaultValueFn: () => ({
      pwd: "",
      isInSearchMode: false,
      filters: defaultFilters(),
    }),
    key: "q",
    history_push: true,
  });

  function resetFilters() {
    // console.log("resetting filters called");
    Object.keys(filters.value).forEach((key) => {
      filters.value[key] = defaults[key];
    });
  }

  function resetByKey(key) {
    // console.log("resetting", key, filters.value[key], defaults[key]);
    filters.value[key] = defaults[key];
  }

  const filterStatus = computed(() => {
    return mapValues(filters.value, (key, value) => value !== defaults[key]);
  });

  function reset() {
    pwd.value = "";
    isInSearchMode.value = false;
    // console.log("resetting filters - reset");
    resetFilters();
  }

  return {
    pwd,
    isInSearchMode,
    filters,
    resetFilters,
    resetByKey,
    defaultFilters,
    filterStatus,
    reset,
  };
});
