<template>
  <AutoCompleteDynamic
    :async="isAsync"
    :data="datasets"
    filter-by="name"
    placeholder="Search datasets by name"
    @update-search="updateSearch"
  >
    <template #filtered="{ item }">
      <div class="flex min-w-full">
        <div>
          <span> {{ item.name }} </span>
          <span class="va-text-secondary p-1"> &VerticalLine; </span>
          <span class="va-text-secondary text-sm"> {{ item.type }} </span>
        </div>
        <div class="text-right">
          <span class="text-sm">
            {{ formatBytes(item.du_size) }}
          </span>
        </div>
      </div>
    </template>
  </AutoCompleteDynamic>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";
import _ from "lodash";

const DEFAULT_RETRIEVAL_QUERY = { sortBy: { name: "asc" }, limit: 5 };
const isAsync = true;

const searchText = ref("");
const datasets = ref([]);
const retrievalQuery = computed(() => {
  return {
    ...DEFAULT_RETRIEVAL_QUERY,
    ...(searchText.value && { name: searchText.value }),
  };
});

const updateSearch = (newText) => {
  searchText.value = newText;
};

const retrieveDatasets = () => {
  datasetService.getAll(retrievalQuery.value).then((res) => {
    datasets.value = res.data.datasets;
  });
};

// If select is async, react to retrieval query changing
watch(retrievalQuery, (value, oldValue) => {
  if (isAsync && !_.isEqual(value, oldValue)) {
    retrieveDatasets();
  }
});

onMounted(() => {
  retrieveDatasets();
});
</script>
