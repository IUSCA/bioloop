<template>
  <Dataset :dataset-id="route.params.datasetId" append-file-browser-url />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import projectService from "@/services/projects";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { useRoute } from "vue-router";

const route = useRoute();
const auth = useAuthStore();

const nav = useNavStore();

// const props = defineProps({ projectId: String });

const dataset = ref({});

Promise.all([
  projectService.getById({
    id: route.params.projectId,
    forSelf: !auth.canOperate,
  }),
  DatasetService.getById({ id: route.params.datasetId }),
]).then((results) => {
  const project = results[0].data;
  dataset.value = results[1].data;
  nav.setNavItems([
    {
      label: "Projects",
      to: `/projects`,
    },
    {
      label: project.name,
      to: `/projects/${project.slug}`,
    },
    {
      label: config.dataset.types[dataset.value.type]?.label,
    },
    {
      label: dataset.name,
    },
  ]);
  useTitle(project.name);
});
// .catch((err) => {
//   console.error(err);
// if (err?.response?.status == 404) toast.error("Could not find the dataset");
// else toast.error("Could not fetch datatset"); });

onMounted(() => {
  console.log("Mounted project file browser");
  console.log("route.params.datasetId", route.params.datasetId);
  console.log("route.params.projectId", route.params.projectId);
});
</script>

<route lang="yaml">
meta:
title: Project's Datasets
</route>
