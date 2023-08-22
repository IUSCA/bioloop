<template>
  <dataset :dataset-id="route.params.datasetId" />
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";

const route = useRoute();
const breadcrumbs = useBreadcrumbsStore();

onMounted(() => {
  // setup page's breadcrumb nav
  const currentBreadcrumbNavItems = breadcrumbs.breadcrumbs;
  if (
    (
      currentBreadcrumbNavItems.filter((item) => item.label === "Datasets") ||
      []
    ).length === 0
  ) {
    breadcrumbs.pushNavItem({ label: "Datasets" });
  }
});
</script>

<route lang="yaml">
meta:
  title: Dataset
  requiresRoles: ["operator", "admin"]
</route>
