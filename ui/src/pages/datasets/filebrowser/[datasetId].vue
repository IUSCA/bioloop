<template>
  <FileBrowser :dataset-id="props.datasetId" />
</template>

<script setup>
const props = defineProps({ datasetId: String });
</script>

<route lang="yaml">
meta:
  title: File Browser
</route>
