import { ref } from "vue";
import { defineStore } from "pinia";

export const useUIStore = defineStore("UI", () => {
  const isMobileView = ref(false);

  function setMobileView(value) {
    isMobileView.value = value;
  }

  return { isMobileView, setMobileView };
});
