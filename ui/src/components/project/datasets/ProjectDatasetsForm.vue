<template>
  <div class="space-y-4">
    <DatasetSelect
      @select="handleSelect"
      @remove="handleRemove"
      :selected-results="projectFormStore.datasets"
    />

    <!--    <div class="flex flex-row justify-between px-1">-->
    <!--      <span class="text-right"-->
    <!--        >{{ maybePluralize(projectFormStore.datasets.length, "dataset") }}-->
    <!--      </span>-->
    <!--    </div>-->

    <!--    <ProjectDatasetsList-->
    <!--      :datasets="projectFormStore.datasets"-->
    <!--      show-remove-->
    <!--      @remove="handleRemove"-->
    <!--    />-->
  </div>
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";

const projectFormStore = useProjectFormStore();

function handleSelect(ds) {
  projectFormStore.addDataset(ds);
}

function handleRemove(ds) {
  projectFormStore.removeDataset(ds);
}
</script>
