<template>
  <dataset-list dtype="DATA_PRODUCT" label="Data Product"></dataset-list>
</template>

<script setup>
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
store.type = 'DATA_PRODUCT';
</script>

<route lang="yaml">
meta:
  title: Data Products
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Data Products" }]
</route>
