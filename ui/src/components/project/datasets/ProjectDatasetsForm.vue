<template>
  <DatasetSelect
    @select="handleSelect"
    @remove="handleRemove"
    :selected-results="projectFormStore.datasets"
  />

  <!--    <ProjectDatasetsList-->
  <!--      :datasets="projectFormStore.datasets"-->
  <!--      show-remove-->
  <!--      @remove="handleRemove"-->
  <!--    />-->
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";

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
