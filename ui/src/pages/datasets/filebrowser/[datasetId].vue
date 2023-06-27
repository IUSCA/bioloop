<template>
  <div>
    <span class="text-xl capitalize" v-if="dataset.type">
      {{ dataset.type.replace("_", " ").toLowerCase() }}:
    </span>
    <span class="text-2xl"> {{ dataset.name }} Files</span>
    <va-divider />
  </div>
  <FileBrowser :dataset-id="props.datasetId" />
</template>

<script setup>
import DatasetService from "@/services/dataset";
import { useToastStore } from "@/stores/toast";
const toast = useToastStore();

const props = defineProps({ datasetId: String });

const dataset = ref({});

DatasetService.getById({ id: props.datasetId, workflows: false })
  .then((res) => {
    dataset.value = res.data;
    console.log(dataset.value);
  })
  .catch((err) => {
    console.error(err);
    if (err?.response?.status == 404) toast.error("Could not find the dataset");
    else toast.error("Something went wrong. Could not fetch datatset");
  });
</script>

<route lang="yaml">
meta:
  title: File Browser
</route>
