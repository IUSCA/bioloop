<template>
  <dataset
    :dataset-id="route.params.datasetId"
    v-if="!!route.params.datasetId"
  />
  <project :project-id="route.params.projectId" v-else />
</template>

<script setup>
const route = useRoute();

onMounted(() => {
  console.log(`URL is: ${route.fullPath}`);
  console.log("params are:");
  console.log(route.params);
});
</script>

<route lang="yaml">
meta:
title: Projects
</route>
