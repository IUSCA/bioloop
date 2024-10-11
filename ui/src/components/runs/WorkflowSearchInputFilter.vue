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

    <va-input
      class="flex-1"
      v-model="search_text"
      :placeholder="`Search by ${getSearchByLabel(search_by)}`"
      clearable
      :type="search_by === 'dataset_id' ? 'number' : 'text'"
    />
  </div>
</template>

<script setup>
const search_by = defineModel("search_by", { type: String, required: true });
const search_text = defineModel("search_text", {
  type: String,
  required: true,
});
// const props = defineProps({});

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
];

function getSearchByLabel(key) {
  return search_by_options.find((o) => o.key === key)?.label;
}

// clear search text when user selects a new search by option
watch(search_by, () => {
  search_text.value = "";
});
</script>
