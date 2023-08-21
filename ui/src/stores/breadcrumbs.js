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

  // function logNavItems() {
  //   console.log("nav item are:");
  //   for (const item in appBreadcrumbs.value) {
  //     console.log(item);
  //   }
  // }

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
    if (from.path.includes("/filebrowser")) {
      resetFileBrowserBreadcrumbItems();
    }

    // If user is going from /projects/:projectId/datasets/:datasetId to /projects/:projectId,
    // remove the dataset's entry in the breadcrumb nav
    if (
      from.params.projectId &&
      from.params.datasetId &&
      !to.params.datasetId
    ) {
      popNavItem();
    }
    // If user is going from the /datasets* path to outside of the /datasets* path, or
    // from the /projects* path to outside of the /projects* path, the breadcrumb items
    // can be reset
    if (
      (from.params.datasetId &&
        !from.params.projectId &&
        !to.params.datasetId) ||
      (from.params.projectId && !to.params.projectId)
    ) {
      resetNavItems();
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
    // logNavItems
  };
});
