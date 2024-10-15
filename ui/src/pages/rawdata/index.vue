<template>
  <dataset-list dtype="RAW_DATA" label="Raw Data"></dataset-list>
</template>

<script setup>
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
store.type = 'RAW_DATA';

</script>

<route lang="yaml">
meta:
  title: Raw Data
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Raw Data" }]
</route>
