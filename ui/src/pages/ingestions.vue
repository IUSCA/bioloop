<template></template>

<script setup>
const loading = ref(false);

const fetchActiveActionItems = () => {
  return actionItemService.
}

onMounted(() => {
  fetchActiveActionItems()
});
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Ingestions
  nav: [{ label: "Ingestions" }]
</route>
