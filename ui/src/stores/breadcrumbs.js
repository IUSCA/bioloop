import { ref } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const appBreadcrumbs = ref([]);
  const fileBrowserBreadcrumbsPath = ref(null);

  function setFileBrowserBreadcrumbsPath(path) {
    fileBrowserBreadcrumbsPath.value = path;
  }

  function resetFileBrowserBreadcrumbItems() {
    setFileBrowserBreadcrumbsPath(null);
  }

  const fileBrowserBreadcrumbsItems = computed(() => {
    if (fileBrowserBreadcrumbsPath.value === null) {
      return [];
    }
    const parts = fileBrowserBreadcrumbsPath.value.split("/");
    return parts.map((t, i) => ({
      label: t,
      rel_path: parts.slice(0, i + 1).join("/"),
    }));
  });

  function pushNavItem(value) {
    appBreadcrumbs.value.push(value);
  }

  function popNavItem() {
    appBreadcrumbs.value.pop();
  }

  function resetNavItems() {
    appBreadcrumbs.value = [];
  }

  function updateNavItems(to, from) {
    // Navigating away the FileBrowser view
    if (from.path.includes("/filebrowser")) {
      resetFileBrowserBreadcrumbItems();
    }

    // Navigating from Project view to outside the Project view
    if (from.params.projectId && !to.params.projectId) {
      resetNavItems();
    }

    // Navigating from Dataset view to outside the Dataset view
    if (from.params.datasetId && !to.params.datasetId) {
      popNavItem();
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
    appBreadcrumbs,
    pushNavItem,
    popNavItem,
    updateNavItems,
    fileBrowserBreadcrumbsItems,
    fileBrowserBreadcrumbsPath,
    setFileBrowserBreadcrumbsPath,
    resetFileBrowserBreadcrumbItems,
  };
});
