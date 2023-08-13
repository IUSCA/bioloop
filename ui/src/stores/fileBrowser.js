import { ref } from "vue";
import { defineStore } from "pinia";
import { mapValues } from "@/services/utils";

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
  const filters = ref(defaultFilters);

  function resetFilters() {
    filters.value = defaultFilters();
  }

  function reset(key) {
    console.log("resetting", key, filters.value[key], defaultFilters()[key]);
    filters.value[key] = defaultFilters()[key];
  }

  const filterStatus = computed(() => {
    return mapValues(filters.value, (key, value) => value !== defaults[key]);
  });

  return {
    pwd,
    isInSearchMode,
    filters,
    resetFilters,
    reset,
    defaultFilters,
    filterStatus,
  };
});
