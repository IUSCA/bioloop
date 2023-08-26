import { ref } from "vue";
import { defineStore } from "pinia";

export const useUIStore = defineStore("UI", () => {
  const isMobileView = ref(false);
  const isLoadingResource = ref(false);

  function setMobileView(value) {
    isMobileView.value = value;
  }

  function setIsLoadingResource(value) {
    isLoadingResource.value = value;
  }

  return {
    isMobileView,
    isLoadingResource,
    setMobileView,
    setIsLoadingResource,
  };
});
