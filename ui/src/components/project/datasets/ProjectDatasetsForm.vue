<template>
  <!--    @select="handleSelect"-->
  <!--    @remove="handleRemove"-->
  <DatasetSelect :selected-results="props.selectedResults" />
</template>

<script setup>
// import { useProjectFormStore } from "@/stores/projects/projectForm";

const props = defineProps({
  selectedResults: {
    type: Array,
    default: () => [],
  },
});

// const projectFormStore = useProjectFormStore();

// function handleSelect(datasets) {
//   for (const ds of datasets) {
//     projectFormStore.addDataset(ds);
//   }
// }

// function handleRemove(datasets) {
//   for (const ds of datasets) {
//     projectFormStore.removeDataset(ds);
//   }
// }
</script>
