<template>
  <va-breadcrumbs>
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbsStore.breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
    />
    <!-- <i-mdi-folder-home class="hover:text-blue-600" v-if="" /> -->
  </va-breadcrumbs>
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";

const breadcrumbsStore = useBreadcrumbsStore();
</script>
