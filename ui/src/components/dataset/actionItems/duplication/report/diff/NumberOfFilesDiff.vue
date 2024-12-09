<template>
  <va-alert
    v-if="props.numFilesOriginalDataset === props.numFilesDuplicateDataset"
    color="success"
    icon="check_circle_outline""
  >
    Number of files match
  </va-alert>

  <div v-else>
    <va-alert color="warning" icon="warning" class="mb-4">
      Number of files do not match
    </va-alert>
  </div>

  <va-data-table :columns="columns" :items="rows"> </va-data-table>
</template>

<script setup>
const props = defineProps({
  numFilesOriginalDataset: { type: Number },
  numFilesDuplicateDataset: { type: Number },
});

const columns = [
  {
    key: "numFilesOriginalDataset",
    label: "Original Dataset",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "numFilesDuplicateDataset",
    label: "Duplicate Dataset",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const rows = computed(() => [
  {
    numFilesOriginalDataset: props.numFilesOriginalDataset,
    numFilesDuplicateDataset: props.numFilesDuplicateDataset,
  },
]);
</script>

<style scoped></style>
