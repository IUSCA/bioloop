<template>
  <Dataset :dataset-id="route.params.datasetId" append-file-browser-url />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import projectService from "@/services/projects";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { useUIStore } from "@/stores/ui";

const auth = useAuthStore();
const nav = useNavStore();
const ui = useUIStore();
const route = useRoute();

const props = defineProps({ projectId: String });

Promise.all([
  projectService.getById({
    id: props.projectId,
    forSelf: !auth.canOperate,
  }),
  DatasetService.getById({ id: route.params.datasetId }),
]).then((results) => {
  const project = results[0].data;
  const dataset = results[1].data;
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
      label: config.dataset.types[dataset.type]?.label,
    },
    {
      label: dataset.name,
    },
  ]);
  ui.setTitle(project.name);
});
</script>

<route lang="yaml">
meta:
  title: Project's Datasets
</route>
