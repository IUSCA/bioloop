<template>
  <AutoCompleteDynamic
    :async="true"
    :data="datasets"
    filter-by="name"
    placeholder="Search datasets by name"
    @update-search="updateSearch"
    :loading="loading"
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

const DEFAULT_FILTER_QUERY = { sortBy: { name: "asc" }, limit: 5 };

const searches = ref([]); // array of Promises, where each Promise represents a search operation
const datasets = ref([]);
const loading = ref(false);
const searchText = ref("");
const searchQuery = computed(() => {
  return {
    ...DEFAULT_FILTER_QUERY,
    ...(searchText.value && { name: searchText.value }),
  };
});

const updateSearch = (newText) => {
  searchText.value = newText;
};

const searchDatasets = (query) => {
  loading.value = true;
  return datasetService.getAll(query || DEFAULT_FILTER_QUERY);
};

const setSearchResults = (_datasets) => {
  datasets.value = _datasets;
  loading.value = false;
};

watch(searchQuery, (value, oldValue) => {
  if (!_.isEqual(value, oldValue)) {
    searches.value.push(searchDatasets(searchQuery.value));
  }
});

// Watcher that triggers when a new search is run
watch(
  searches,
  () => {
    Promise.all(searches.value).then((responses) => {
      // At this point, `responses` will not necessarily be the same length as `searches`,
      // since some searches may not have resolved yet. These two having the same length
      // implies that all searches have resolved.
      if (searches.value.length === responses.length) {
        const latestResponse = responses[responses.length - 1];
        setSearchResults(latestResponse.data.datasets);
      }
    });
  },
  { deep: true },
);

onMounted(() => {
  searchDatasets().then((res) => {
    setSearchResults(res.data.datasets);
  });
});
</script>
