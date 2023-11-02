<script setup>
import datasetService from "@/services/dataset";

const pastUploads = ref([]);

onMounted(() => {
  datasetService.getDataProductUploads().then((res) => {
    pastUploads.value = res.data;
  });
});
</script>

<template>
  <va-data-table :items="pastUploads"></va-data-table>
</template>

<style scoped></style>
