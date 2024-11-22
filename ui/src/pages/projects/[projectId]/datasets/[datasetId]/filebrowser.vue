<template>
  <FileBrowser
    :dataset-id="props.datasetId"
    :show-download="config.enabledFeatures.downloads && dataset.is_staged"
  />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import projectService from "@/services/projects";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";

const auth = useAuthStore();

const nav = useNavStore();

const props = defineProps({ projectId: String, datasetId: String });

const dataset = ref({});

Promise.all([
  projectService.getById({
    id: props.projectId,
    forSelf: !auth.canOperate,
  }),
  DatasetService.getById({ id: props.datasetId }),
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
        to: `/projects/${project.slug}/datasets/${dataset.value.id}`,
      },
      {
        label: "File Browser",
      },
    ]);
    useTitle(project.name);
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
