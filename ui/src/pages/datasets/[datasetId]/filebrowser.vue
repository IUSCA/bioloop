<template>
  <div>
    <va-divider />
  </div>
  <FileBrowser :dataset-id="route.params.datasetId" />
</template>

<script setup>
const route = useRoute();
</script>

<route lang="yaml">
meta:
  title: File Browser
</route>
