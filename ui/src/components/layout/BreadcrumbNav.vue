<template>
  <va-breadcrumbs>
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbsStore.breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
    />
  </va-breadcrumbs>
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";

const breadcrumbsStore = useBreadcrumbsStore();

// const breadcrumbs = computed(() => {
//   return route.meta.breadcrumbs;
// });
</script>
