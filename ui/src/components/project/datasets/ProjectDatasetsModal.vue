<template>
  <va-modal
    class="project-datasets-modal"
    v-model="visible"
    title="Manage Access"
    no-outside-dismiss
    fixed-layout
    @before-open="fetchAssociatedDatasets"
    @ok="handleOk"
    @close="hide"
    :size="modalSize"
  >
    <ProjectDatasetsForm
      :selected-results="selectedDatasets"
      @select="(datasets) => updateDatasetsToAdd(datasets)"
      @remove="(datasets) => updateDatasetsToRemove(datasets)"
      @loading="loadingSearchableDatasets = true"
      @loaded="loadingSearchableDatasets = false"
    />
  </va-modal>
</template>

<script setup>
import projectService from "@/services/projects";
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { useBreakpoint } from "vuestic-ui";
import toast from "@/services/toast";

const breakpoint = useBreakpoint();

const props = defineProps(["id"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const loading = ref(false);
const loadingSearchableDatasets = ref(false);
const loadingResources = computed(
  () => loading.value || loadingSearchableDatasets.value,
);
provide("loadingResources", loadingResources);

const datasetsToAdd = ref([]);
const datasetsToRemove = ref([]);
// datasets that have been assigned to the project
const persistedDatasetAssociations = ref([]);

const selectedDatasets = computed(() =>
  persistedDatasetAssociations.value
    .filter(
      (ds) => !datasetsToRemove.value.find((toRemove) => toRemove.id === ds.id),
    )
    .concat(datasetsToAdd.value),
);

const modalSize = computed(() =>
  breakpoint.xs || breakpoint.sm ? "medium" : "large",
);

const projectFormStore = useProjectFormStore();

const visible = ref(false);

const updateDatasetsToAdd = (datasets) => {
  datasets.forEach((d) => {
    // filter out datasets that are already associated with the project, or are already selected for a new association
    if (
      !persistedDatasetAssociations.value.find((ds) => ds.id === d.id) &&
      !datasetsToAdd.value.find((ds) => ds.id === d.id)
    ) {
      datasetsToAdd.value.push(d);
    }

    const index = datasetsToRemove.value.findIndex((ds) => ds.id === d.id);
    if (index >= 0) {
      datasetsToRemove.value.splice(index, 1);
    }
  });
};

const updateDatasetsToRemove = (datasets) => {
  datasets.forEach((d) => {
    if (!datasetsToRemove.value.find((ds) => ds.id === d.id)) {
      datasetsToRemove.value.push(d);
    }
    const index = datasetsToAdd.value.findIndex((ds) => ds.id === d.id);
    if (index >= 0) {
      datasetsToAdd.value.splice(index, 1);
    }
  });
};

function hide() {
  loading.value = false;
  visible.value = false;
  projectFormStore.$reset();

  resetDatasetSelections();
}

function resetDatasetSelections() {
  datasetsToAdd.value = [];
  datasetsToRemove.value = [];
}

function show() {
  visible.value = true;
}

function handleOk() {
  const add_dataset_ids = datasetsToAdd.value.map((dataset) => dataset.id);
  const remove_dataset_ids = datasetsToRemove.value.map(
    (dataset) => dataset.id,
  );
  projectService
    .updateDatasets({ id: props.id, add_dataset_ids, remove_dataset_ids })
    .finally(() => {
      emit("update");
      hide();
    });
}

const fetchAssociatedDatasets = () => {
  loading.value = true;
  projectService
    .getDatasets({ id: props.id })
    .then((res) => {
      persistedDatasetAssociations.value = res.data.datasets;
    })
    .catch(() => {
      toast.error("Failed to fetch project's datasets");
    })
    .finally(() => {
      loading.value = false;
    });
};
</script>

<style lang="scss">
.project-datasets-modal {
  .va-modal__dialog {
    overflow: auto;
  }
}
</style>
