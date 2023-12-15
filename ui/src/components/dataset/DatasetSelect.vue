<template>
  <AutoCompleteDynamic
    class="dataset-select"
    :data="datasets"
    filter-by="name"
    placeholder="Search datasets by name"
    text-by="name"
    track-by="id"
    @update-search="updateRetrievalQuery"
  >
    <template #filtered="{ item }">
      <div class="flex">
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

  <AutoComplete
    :data="datasets"
    filter-by="name"
    placeholder="Search datasets by name"
  >
    <template #filtered="{ item }">
      <div class="flex">
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
  </AutoComplete>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";

const DEFAULT_RETRIEVAL_QUERY = { sortBy: { name: "asc" }, limit: 5 };

const datasets = ref([]);
const retrievalQuery = ref(DEFAULT_RETRIEVAL_QUERY);

const updateRetrievalQuery = (searchText) => {
  retrievalQuery.value = {
    ...retrievalQuery.value,
    name: searchText || undefined,
  };
};

const retrieveDatasets = () => {
  datasetService.getAll(retrievalQuery.value).then((res) => {
    datasets.value = res.data.datasets;
  });
};

onMounted(() => {
  retrieveDatasets();
});

watch(retrievalQuery, () => {
  retrieveDatasets();
});
</script>
