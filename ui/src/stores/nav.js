import { ref, computed } from "vue";
import { defineStore } from "pinia";

export const useNavStore = defineStore("nav", () => {
  // Array containing the breadcrumb nav items currently being rendered in the app.
  const breadcrumbs = ref([]);
  const sidebarDatasetType = ref(null);

  /**
   *
   * @param {Object} item - Adds a new breadcrumb item to the breadcrumbs
   * array. Is an object containing the following optional attributes:
   * - label    - label for the breadcrumb item
   * - icon     - icon for the breadcrumb item
   * - to       - redirect URL for the breadcrumb item
   * - disabled - prevents breadcrumb item from being clickable
   *
   * One of label or icon must be provided for the corresponding breadcrumb
   * item to be rendered.
   *
   * If the provided item already exists in the breadcrumbs array, it won't
   * be added.
   */
  function addNavItem(item) {
    if (!item || !(item.label || item.icon)) {
      return;
    }

    const matchingBreadcrumbItems = computed(() => {
      return (
        breadcrumbs.value.filter(
          (e) =>
            e.icon === item.icon && e.label === item.label && e.to === item.to,
        ) || []
      );
    });
    // adds breadcrumb item if it doesn't already exist in the current state.
    if (matchingBreadcrumbItems.value.length === 0) {
      breadcrumbs.value.push(item);
    }
  }

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
    addNavItem,
    resetNavItems,
    setNavItems,
  };
});
