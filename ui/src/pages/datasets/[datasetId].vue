<template>
  <dataset :dataset-id="route.params.datasetId" />
</template>

<script setup>
const route = useRoute();
</script>

<route lang="yaml">
meta:
  title: Dataset
  requiresRoles: ["operator", "admin"]
</route>
