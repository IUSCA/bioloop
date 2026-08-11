<template>
  <DatasetSelect
    :selected-results="props.selectedResults"
    :column-widths="props.columnWidths"
    @select="handleSelect"
    @remove="handleRemove"
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
    required: false,
  },
});

const emit = defineEmits(["select", "remove"]);

const projectFormStore = useProjectFormStore();

function handleSelect(datasets) {
  for (const ds of datasets) {
    projectFormStore.addDataset(ds);
  }
  emit("select", datasets);
}

function handleRemove(datasets) {
  for (const ds of datasets) {
    projectFormStore.removeDataset(ds);
  }
  emit("remove", datasets);
}
</script>
