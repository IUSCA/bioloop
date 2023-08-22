import { ref, computed } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);

  function resetToLevel(level) {
    breadcrumbs.value = breadcrumbs.value.slice(0, level + 1);
  }

  function removeNavItem(item) {
    // Remove the item that matches the given icon's label, icon, or to
    let ret = breadcrumbs.value.map((e) => {
      if (item.icon) {
        return item.icon !== e.icon && e;
      }
      if (item.label) {
        return item.label !== e.label && e;
      }
      if (item.to) {
        return item.to !== e.to && e;
      }
    });
    breadcrumbs.value = ret;
  }

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
      // clear any array items after insertAt
      if (typeof insertAt === "number") {
        breadcrumbs.value = breadcrumbs.value.slice(0, insertAt);
      }
      breadcrumbs.value.push(item);
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
    if (to.path.includes("/users")) {
      pushNavItem({ label: "User Management", to: "/users" }, 1);
    }
    if (to.path.includes("/about")) {
      pushNavItem({ label: "About", to: "/about" }, 1);
    }
    if (to.path.includes("/profile")) {
      pushNavItem({ label: "Profile", to: "/profile" }, 1);
    }
    if (to.path.includes("/filebrowser")) {
      pushNavItem({ icon: "mdi-folder-home" });
    } else {
      if (from.path.includes("/filebrowser")) {
        removeNavItem({ icon: "mdi-folder-home" });
      }
    }

    // Navigating from Project view to outside the Project view
    if (to.path.includes("projects") && !to.params.projectId) {
      resetToLevel(1);
    }

    // Navigating from Dataset view to outside the Dataset view
    if (!to.params.datasetId) {
      if (to.path.includes("projects") && to.params.projectId) {
        resetToLevel(2);
      } else {
        resetToLevel(1);
      }
    }

    // Navigating from one Dataset to another
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
  };
});
