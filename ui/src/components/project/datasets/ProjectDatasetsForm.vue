<template>
  <DatasetSelect
    :selected-results="props.selectedResults"
    @select="handleSelect"
    @remove="handleRemove"
    :column-widths="props.columnWidths"
  />
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";

const props = defineProps({
  selectedResults: {
    type: Array,
    default: () => [],
  },
  columnWidths: {
    type: Object,
    required: true,
  },
});

const projectFormStore = useProjectFormStore();

function handleSelect(datasets) {
  for (const ds of datasets) {
    projectFormStore.addDataset(ds);
  }
}

function handleRemove(datasets) {
  for (const ds of datasets) {
    projectFormStore.removeDataset(ds);
  }
}
</script>
