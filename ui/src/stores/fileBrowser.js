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
  const filters = ref(defaultFilters());
  const fileList = ref([]);

  function setFileList(value) {
    fileList.value = value;
  }

  function resetFilters() {
    Object.keys(filters.value).forEach((key) => {
      filters.value[key] = defaults[key];
    });
  }

  function resetByKey(key) {
    console.log("resetting", key, filters.value[key], defaults[key]);
    filters.value[key] = defaults[key];
  }

  const filterStatus = computed(() => {
    return mapValues(filters.value, (key, value) => value !== defaults[key]);
  });

  function reset() {
    pwd.value = "";
    isInSearchMode.value = false;
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
    fileList,
    setFileList,
  };
});
