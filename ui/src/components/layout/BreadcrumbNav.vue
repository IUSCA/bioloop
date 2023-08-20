<template>
  <va-breadcrumbs>
    <!-- Global breadcrumb nav -->
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbsStore.appBreadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
    />
    <!-- Breadcrumb nav for items within a page -->
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbsStore.fileBrowserBreadcrumbsItems"
      :key="`${item}-${index}`"
      :label="item.label"
      @click="breadcrumbsStore.setFileBrowserBreadcrumbsPath(item.rel_path)"
    />
  </va-breadcrumbs>
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";

const breadcrumbsStore = useBreadcrumbsStore();
</script>
