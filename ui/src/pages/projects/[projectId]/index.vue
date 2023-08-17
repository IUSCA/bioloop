<template>
  <project :project-id="route.params.projectId" />
</template>

<script setup>
const route = useRoute();

// onMounted(() => {
//   console.log(`URL is: ${route.fullPath}`);
//   console.log("params are:");
//   console.log(route);
// });
</script>

<route lang="yaml">
meta:
title: Projects
</route>
