import { ref } from "vue";
import { defineStore } from "pinia";

export const useFileBrowserStore = defineStore("fileBrowser", () => {
  const pwd = ref("");
  const isInSearchMode = ref(false);
  const nameFilter = ref("");

  // location - anywhere ('') | path
  const locationFilter = ref("");

  function clearSearchFilters() {
    nameFilter.value = "";
    locationFilter.value = "";
    isInSearchMode.value = false;
  }

  return {
    pwd,
    isInSearchMode,
    nameFilter,
    locationFilter,
    clearSearchFilters,
  };
});
