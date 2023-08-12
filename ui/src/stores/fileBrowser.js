import { ref } from "vue";
import { defineStore } from "pinia";

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

  return {
    pwd,
    isInSearchMode,
    filters,
    resetFilters,
    reset,
    defaultFilters,
  };
});
