import { ref } from "vue";
import { defineStore } from "pinia";

export const useNavStore = defineStore("nav", () => {
  // Array containing the breadcrumb nav items currently being rendered in the app.
  const breadcrumbs = ref([]);
  const sidebarDatasetType = ref(null);

  function setNavItems(items, withHome = true) {
    const isValid = (item) => item && (item.label || item.icon);
    const HOME = {
      icon: "mdi-home",
      to: "/",
    };
    breadcrumbs.value = (withHome ? [HOME] : []).concat(items.filter(isValid));
  }

  /**
   * Resets breadcrumbs.
   */
  function resetNavItems() {
    breadcrumbs.value = [];
  }

  return {
    breadcrumbs,
    sidebarDatasetType,
    resetNavItems,
    setNavItems,
  };
});
