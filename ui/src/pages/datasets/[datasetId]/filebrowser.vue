<template>
  <FileBrowser
    :dataset-id="props.datasetId"
    :show-download="config.file_browser.enable_downloads && dataset.is_staged"
  />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import toast from "@/services/toast";
import { useNavStore } from "@/stores/nav";
import { storeToRefs } from "pinia";

const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);

const props = defineProps({ datasetId: String });

const dataset = ref({});

DatasetService.getById({ id: props.datasetId, workflows: false })
  .then((res) => {
    dataset.value = res.data;
    nav.setNavItems([
      {
        label: config.dataset.types[dataset.value.type]?.label,
        to: `/${config.dataset.types[dataset.value.type]?.collection_path}`,
      },
      {
        label: dataset.value.name,
        to: `/datasets/${dataset.value.id}`,
      },
      {
        label: "File Browser",
      },
    ]);
    sidebarDatasetType.value = dataset.value.type;
  })
  .catch((err) => {
    console.error(err);
    if (err?.response?.status == 404) toast.error("Could not find the dataset");
    else toast.error("Could not fetch datatset");
  });
</script>

<route lang="yaml">
meta:
  title: File Browser
</route>
