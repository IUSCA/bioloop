<template>
  <Dataset :dataset-id="props.datasetId" />
</template>

<script setup>
import DatasetService from "@/services/dataset";
import { useNavStore } from "@/stores/nav";
import { storeToRefs } from "pinia";
import config from "@/config";

const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);

const props = defineProps({ datasetId: String });

DatasetService.getById({ id: props.datasetId }).then((res) => {
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
});
</script>
