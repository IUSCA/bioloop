<template>
  <va-breadcrumbs>
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbsStore.breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
    >
      <!-- <Icon icon="data-matrix" /> -->
      <Icon :icon="item.icon" v-if="!!item.icon" />
    </va-breadcrumbs-item>
  </va-breadcrumbs>
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";

const breadcrumbsStore = useBreadcrumbsStore();

watch(
  () => breadcrumbsStore.breadcrumbs,
  () => {
    console.log();
  }
);
</script>
