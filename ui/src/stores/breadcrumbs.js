import { ref, computed } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);
  const breadcrumbNavItems = computed(() =>
    breadcrumbs.value.filter((e) => e !== undefined)
  );

  function addNavItem(item, insertAtIndex) {
    if (!item) {
      return;
    }

    const matchingBreadcrumbItems = computed(() => {
      return (
        breadcrumbs.value.filter(
          (e) =>
            e.icon === item.icon && e.label === item.label && e.to === item.to
        ) || []
      );
    });
    // only add breadcrumb item if it doesn't already exist in
    // the current breadcrumb nav items
    if (matchingBreadcrumbItems.value.length === 0) {
      if (typeof insertAtIndex === "number") {
        // fill the array until it is the size needed to insert at insertAtIndex
        if (breadcrumbs.value.length < insertAtIndex) {
          Array(insertAtIndex - breadcrumbs.value.length).forEach(() => {
            breadcrumbs.value.push(undefined);
          });
        }
        breadcrumbs.value[insertAtIndex] = item;
      }
    }
  }

  function resetNavItems() {
    breadcrumbs.value = [];
  }

  return {
    breadcrumbNavItems,
    addNavItem,
    resetNavItems,
  };
});
