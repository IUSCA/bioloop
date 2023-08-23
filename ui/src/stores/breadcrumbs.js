import { ref, computed } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);
  const breadcrumbNavItems = computed(() =>
    breadcrumbs.value.filter((e) => e !== undefined)
  );

  function addNavItem({ label, icon, to }, insertAtIndex) {
    const item = { label, icon, to };
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

  // Builds the breadcrumb hierarchy. Is called every time the path changes
  function updateNavItems(to) {
    const home_breadcrumb_item = { icon: "mdi-home", to: "/" };
    breadcrumbs.value = [home_breadcrumb_item];

    if (to.path.includes("/projects")) {
      addNavItem({ label: "Projects", to: "/projects" }, 1);
      if (to.path.includes("/datasets")) {
        addNavItem({ label: "Dataset" }, 3);
        if (to.path.includes("/filebrowser")) {
          addNavItem({ icon: "mdi-folder-home" }, 5);
        }
      }
    }
    if (
      to.path.includes("/datasets") ||
      to.path.includes("/rawdata") ||
      to.path.includes("/dataproducts")
    ) {
      if (to.path.includes("/rawdata")) {
        addNavItem({ label: "Raw Data", to: "/rawdata" }, 1);
      } else if (to.path.includes("/dataproducts")) {
        addNavItem({ label: "Data Products", to: "/dataproducts" }, 1);
      } else if (to.path.includes("/datasets")) {
        addNavItem({ label: "Dataset" }, 1);
      }

      if (to.path.includes("/filebrowser")) {
        addNavItem({ icon: "mdi-folder-home" }, 3);
      }
    }

    if (to.path.includes("/users")) {
      addNavItem({ label: "User Management", to: "/users" }, 1);
    }

    if (to.path.includes("/about")) {
      addNavItem({ label: "About", to: "/about" }, 1);
    }

    if (to.path.includes("/profile")) {
      addNavItem({ label: "Profile", to: "/profile" }, 1);
    }
  }

  return {
    breadcrumbNavItems,
    addNavItem,
    updateNavItems,
  };
});
