<template>
  <div>{{ dataset.name }}</div>
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

DatasetService.list_files({ id: props.datasetId, basepath: "dir1/" })
  .then((res) => {
    console.log(res.data);
  })
  .catch((err) => {
    console.error(err);
    toast.error("Something went wrong. Could not fetch datatset files");
  });
</script>
