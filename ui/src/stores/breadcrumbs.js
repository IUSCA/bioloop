import { ref, computed } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);
  const breadcrumbNavItems = computed(() =>
    breadcrumbs.value.filter((e) => e !== undefined)
  );

  function removeProjectBreadcrumbs() {
    breadcrumbs.value = breadcrumbs.value.filter((item) => {
      return !item.to?.includes("projects");
    });
  }

  function removeDatasetBreadcrumbs() {
    breadcrumbs.value = breadcrumbs.value.filter((item) => {
      return (
        !item.label?.includes("Data Products") &&
        !item.label?.includes("Raw Data") &&
        !item.label?.includes("Dataset") &&
        !item.to?.includes("/datasets")
      );
    });
  }

  function removeFilebrowserBreadcrumbs() {
    breadcrumbs.value = breadcrumbs.value.filter((item) => {
      return item.label !== "Files";
    });
  }

  function addNavItem(item, insertAtIndex) {
    if (!item) {
      return;
    }

    const { label, icon, to } = item;

    const matchingBreadcrumbItems = computed(() => {
      return (
        breadcrumbs.value.filter(
          (e) => e.icon === icon && e.label === label && e.to === to
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

  return {
    breadcrumbNavItems,
    addNavItem,
    removeProjectBreadcrumbs,
    removeDatasetBreadcrumbs,
    removeFilebrowserBreadcrumbs,
  };
});
