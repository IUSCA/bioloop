import { ref } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);

  function pushNavItem(value) {
    breadcrumbs.value.push(value);
  }

  function popNavItem() {
    breadcrumbs.value.pop();
  }

  function resetNavItems() {
    breadcrumbs.value = [];
  }

  function updateNavItems(to, from) {
    // Navigating from Project view to outside the Project view
    if (from.params.projectId && !to.params.projectId) {
      resetNavItems();
    }

    // Navigating from Dataset view to outside the Dataset view
    if (from.params.datasetId && !to.params.datasetId) {
      popNavItem();
      // clear the 'Datasets' item from the breadcrumb items
      breadcrumbs.value = breadcrumbs.value.filter(
        (item) => item.label !== "Datasets"
      );
    }

    // Navigating from one datasets to another
    if (
      from.params.datasetId &&
      to.params.datasetId &&
      from.params.datasetId !== to.params.datasetId
    ) {
      popNavItem();
    }
  }
  return {
    breadcrumbs,
    pushNavItem,
    popNavItem,
    updateNavItems,
    // fileBrowserBreadcrumbsItems,
    // fileBrowserBreadcrumbsPath,
    // setFileBrowserBreadcrumbsPath,
    // resetFileBrowserBreadcrumbItems,
  };
});
