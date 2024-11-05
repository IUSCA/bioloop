import config from "@/config";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useUIStore = defineStore("UI", () => {
  const isMobileView = ref(false);
  const title = useTitle();

  function setMobileView(value) {
    isMobileView.value = value;
  }

  function setTitle(value) {
    // console.log("setTitle", value);
    title.value = `${value} | ${config.appTitle}`;
  }

  return { isMobileView, setMobileView, setTitle };
});
