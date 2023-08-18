import { ref } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);

  // function logNavItems() {
  //   console.log("nav item are:");
  //   for (const item in breadcrumbs.value) {
  //     console.log(item);
  //   }
  // }

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
    breadcrumbs,
    pushNavItem,
    popNavItem,
    updateNavItems,
    // logNavItems
  };
});
