<template>
  <Dataset
    v-if="dataset"
    v-model:dataset="dataset"
    append-file-browser-url
  />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import projectService from "@/services/projects";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { useUIStore } from "@/stores/ui";

const auth = useAuthStore();
const nav = useNavStore();
const ui = useUIStore();

const props = defineProps({ projectId: String, datasetId: String });

const dataset = ref(null);

Promise.all([
  projectService.getById({
    id: props.projectId,
    forSelf: !auth.canOperate,
  }),
  DatasetService.getById({
    id: props.datasetId,
    bundle: true,
    initiator: true,
    include_source_instrument: true,
  }),
])
  .then((results) => {
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
        label: dataset.value.name,
      },
    ]);
    ui.setTitle(project.name);
  })
  .catch((err) => {
    console.error(err);
    if (err?.response?.status == 404) toast.error("Could not find the dataset");
    else toast.error("Could not fetch dataset");
  });
</script>

<route lang="yaml">
meta:
  title: Project's Datasets
  requiresRoles: ["operator", "admin"]
</route>
