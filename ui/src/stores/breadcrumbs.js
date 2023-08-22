import { ref, computed } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);

  function pushNavItem({ label, icon, to }, insertAt) {
    const item = { label, icon, to };
    const matchingBreadcrumbItems = computed(() => {
      return (
        breadcrumbs.value.filter(
          (e) => e.icon === icon && e.label === label && e.to === to
        ) || []
      );
    });

    if (matchingBreadcrumbItems.value.length === 0) {
      if (typeof insertAt === "number") {
        breadcrumbs.value[insertAt] = item;
      } else {
        breadcrumbs.value.push(item);
      }
    }
  }

  function popNavItem() {
    breadcrumbs.value.pop();
  }

  function updateNavItems(to, from) {
    if (to.path === "/dashboard") {
      breadcrumbs.value = [{ icon: "mdi-home", to: "/" }];
    } else {
      pushNavItem({ icon: "mdi-home", to: "/" }, 0);
    }
    if (to.path.includes("/projects")) {
      pushNavItem({ label: "Projects", to: "/projects" }, 1);
    }
    if (to.path.includes("/projects") && to.params.datasetId) {
      pushNavItem({ label: "Datasets" });
    }
    if (to.path.includes("/rawdata")) {
      pushNavItem({ label: "Raw Data", to: "/rawdata" }, 1);
    }
    if (to.path.includes("/dataproducts")) {
      pushNavItem({ label: "Data Products", to: "/dataproducts" }, 1);
    }

    // Navigating from Project view to outside the Project view
    if (from.params.projectId && !to.params.projectId) {
      popNavItem();
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
