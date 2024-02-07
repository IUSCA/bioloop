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
    <va-inner-loading
      :loading="loading"
      class="min-w-full sm:min-h-[50vh] sm:max-h-[65vh]"
    >
      <ProjectDatasetsForm
        :selected-results="selectedDatasets"
        @select="(datasets) => updateDatasetsToAdd(datasets)"
        @remove="(datasets) => updateDatasetsToRemove(datasets)"
        :column-widths="columnWidths"
      />
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import projectService from "@/services/projects";
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { useBreakpoint } from "vuestic-ui";

const breakpoint = useBreakpoint();

const props = defineProps(["id"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

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

const columnWidths = computed(() => {
  return {
    name: breakpoint.xs || breakpoint.sm ? "175px" : "180px",
    type: "130px",
    size: "100px",
    created_at: "105px",
  };
});

const projectFormStore = useProjectFormStore();

const loading = ref(false);
const visible = ref(false);

const updateDatasetsToAdd = (datasets) => {
  // debugger;
  datasets.forEach((d) => {
    // filter out datasets that are already associated with the project, or are already selected for a new association
    if (
      !persistedDatasetAssociations.value.find((ds) => ds.id === d.id) &&
      !datasetsToAdd.value.find((ds) => ds.id === d.id)
    ) {
      datasetsToAdd.value.push(d);
    }

    datasetsToRemove.value.splice(datasetsToRemove.value.indexOf(d), 1);
  });
};

const updateDatasetsToRemove = (datasets) => {
  // debugger;
  datasets.forEach((d) => {
    if (!datasetsToRemove.value.find((ds) => ds.id === d.id)) {
      datasetsToRemove.value.push(d);
    }
    datasetsToAdd.value.splice(datasetsToAdd.value.indexOf(d), 1);
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
  // debugger;
  projectService
    .updateDatasets({ id: props.id, add_dataset_ids, remove_dataset_ids })
    .finally(() => {
      emit("update");
      hide();
    });
}

const fetchAssociatedDatasets = () => {
  projectService.getDatasets({ id: props.id }).then((res) => {
    persistedDatasetAssociations.value = res.data.datasets;
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
