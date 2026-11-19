<template>
  <Dataset v-if="dataset" v-model:dataset="dataset" />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import toast from "@/services/toast";
import { useNavStore } from "@/stores/nav";
import { useUIStore } from "@/stores/ui";
import { storeToRefs } from "pinia";

const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);
const ui = useUIStore();

const props = defineProps({ datasetId: String });

const dataset = ref(null);

DatasetService.getById({
  id: props.datasetId,
  bundle: true,
  initiator: true,
  include_source_instrument: true,
})
  .then((res) => {
    dataset.value = res.data;
    nav.setNavItems([
      {
        label: config.dataset.types[dataset.value.type]?.label,
        to: `/${config.dataset.types[dataset.value.type]?.collection_path}`,
      },
      {
        label: dataset.value.name,
      },
    ]);
    sidebarDatasetType.value = dataset.value.type;
    ui.setTitle(dataset.value.name);
  })
  .catch((err) => {
    console.error(err);
    if (err?.response?.status == 404) toast.error("Could not find the dataset");
    else toast.error("Could not fetch dataset");
  });
</script>

<route lang="yaml">
meta:
  title: Dataset Details
  requiresRoles: ["operator", "admin"]
</route>
