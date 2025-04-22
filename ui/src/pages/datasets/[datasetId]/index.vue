<template>
  <Dataset :dataset-id="route.params.datasetId" />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import { useNavStore } from "@/stores/nav";
import { useUIStore } from "@/stores/ui";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";

const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);
const ui = useUIStore();

const route = useRoute();

console.log("route.params", route.params);

// const props = defineProps({ datasetId: String });

onMounted(() => {
  console.log("index.vue: props.datasetId", route.params.datasetId);
});

DatasetService.getById({ id: route.params.datasetId }).then((res) => {
  const dataset = res.data;
  nav.setNavItems([
    {
      label: config.dataset.types[dataset.type]?.label,
      to: `/${config.dataset.types[dataset.type]?.collection_path}`,
    },
    {
      label: dataset.name,
    },
  ]);
  sidebarDatasetType.value = dataset.type;
  ui.setTitle(dataset.name);
});
</script>

<route lang="yaml">
meta:
title: Dataset Details
</route>
