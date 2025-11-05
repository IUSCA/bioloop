<template>
  <div class="flex w-full gap-2">
    <va-select
      class="flex-none"
      v-model="search_by"
      :options="search_by_options"
      label="Search by"
      inner-label
      :auto-select-first-option="true"
      track-by="key"
      text-by="label"
      value-by="key"
    >
    </va-select>

    <div class="flex-1">
      <!-- Dropdown for search by Workflow Name -->
      <va-select
        v-if="search_by === 'workflow_name'"
        class="w-full"
        v-model="search_text"
        :options="workflow_names"
        text-by="label"
        value-by="key"
        placeholder="Select Workflow"
        clearable
      />
      <!-- Autocomplete for search by Dataset Name -->
      <DatasetSelectAutoComplete
        v-else-if="search_by === 'dataset_name'"
        class="w-full"
        v-model:selected="selected_dataset"
        v-model:search-term="dataset_search_text"
        @clear="resetDatasetSearch"
        @close="onDatasetSearchClose"
        :placeholder="`Search by ${getSearchByLabel(search_by)}`"
      />
      <!-- Inputs for search by Workflow ID / Dataset Id -->
      <va-input
        v-else
        class="w-full"
        v-model="search_text"
        :placeholder="`Search by ${getSearchByLabel(search_by)}`"
        clearable
        :type="search_by === 'dataset_id' ? 'number' : 'text'"
      />
    </div>
  </div>
</template>

<script setup>
import workflowService from "@/services/workflow";

const search_by = defineModel("search_by", { type: String, required: true });
const search_text = defineModel("search_text", {
  type: String,
  required: true,
});
// const props = defineProps({});

const selected_dataset = ref(null);
const dataset_search_text = ref("");

const workflow_names = ref([]);

const search_by_options = [
  {
    label: "Dataset Name",
    key: "dataset_name",
  },
  {
    label: "Dataset ID",
    key: "dataset_id",
  },
  {
    label: "Workflow ID",
    key: "workflow_id",
  },
  {
    label: "Workflow Name",
    key: "workflow_name",
  },
];

function getSearchByLabel(key) {
  return search_by_options.find((o) => o.key === key)?.label;
}

function resetDatasetSearch() {
  selected_dataset.value = null;
  dataset_search_text.value = "";
}

function onDatasetSearchClose() {
  if (!selected_dataset.value) {
    dataset_search_text.value = "";
  } else {
    dataset_search_text.value = selected_dataset.value?.name || "";
  }
}

function toTitleCase(text) {
  return text
    .replace(/_/g, " ")
    .split(" ")
    .filter((segment) => segment.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// clear search text when user selects a new search by option
watch(search_by, () => {
  // clear search-field's search text
  search_text.value = "";
  // clear Dataset-Search attributes
  selected_dataset.value = null;
  dataset_search_text.value = "";
});

onMounted(() => {
  workflowService
    .getWorkflowNames()
    .then((res) => {
      workflow_names.value = res.data.map((wf_name) => {
        return {
          key: wf_name,
          label: toTitleCase(wf_name),
        };
      });
    })
    .catch(() => {
      // console.error("error fetching workflow names");
    });
});

watch(selected_dataset, () => {
  search_text.value = selected_dataset.value?.name || "";
});
</script>
