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

  function updateNavItems(to, from) {
    // If user is going from the */datasets* path to outside of the */datasets* path, or
    // from the /projects* path to outside of the /projects* path, the last breadcrumb
    // nav item can be removed
    if (
      (from.params.datasetId && !to.params.datasetId) ||
      (from.params.projectId && !to.params.projectId)
    ) {
      popNavItem();
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
