<template>
  <div class="md:w-[400px] h-[calc(100vh-180px)] md:max-h-[30rem] space-y-4">
    <DatasetSelect @select="handleSelect" />

    <div class="flex flex-row justify-between px-1">
      <span class="text-lg font-bold tracking-wide">Assigned Datasets</span>
      <span class="text-right"
        >{{ maybePluralize(projectFormStore.datasets.length, "dataset") }}
      </span>
    </div>

    <ProjectDatasetsList
      :datasets="projectFormStore.datasets"
      show-remove
      @remove="handleRemove"
    />
  </div>
</template>

<script setup>
import { maybePluralize } from "@/services/utils";
import { useProjectFormStore } from "@/stores/projects/projectForm";

const projectFormStore = useProjectFormStore();

function handleSelect(ds) {
  projectFormStore.addDataset(ds);
}

function handleRemove(ds) {
  projectFormStore.removeDataset(ds);
}
</script>
