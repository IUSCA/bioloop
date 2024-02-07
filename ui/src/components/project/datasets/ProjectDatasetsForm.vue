<template>
  <DatasetSelect
    :selected-results="props.selectedResults"
    @select="handleSelect"
    @remove="handleRemove"
    :column-widths="props.columnWidths"
    :project-id="props.projectId"
  />
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";

const props = defineProps({
  projectId: {
    type: String,
  },
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
