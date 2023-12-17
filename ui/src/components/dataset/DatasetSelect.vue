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

const BASE_FILTER_QUERY = { sortBy: { name: "asc" }, limit: 5 };

const searches = ref([]); // array of Promises, where each Promise represents a search operation
const datasets = ref([]); // Options passed to the <select />
const loading = ref(false);
const searchText = ref("");
const searchQuery = computed(() => {
  return {
    ...BASE_FILTER_QUERY,
    ...(searchText.value && { name: searchText.value }),
  };
});

const updateSearch = (newText) => {
  searchText.value = newText;
};

const searchResults = (query) => {
  loading.value = true;
  return datasetService.getAll(query || BASE_FILTER_QUERY);
};

const persistResultsToState = (results) => {
  datasets.value = results;
  loading.value = false;
};

watch(searchQuery, (value, oldValue) => {
  if (!_.isEqual(value, oldValue)) {
    searches.value.push(searchResults(searchQuery.value));
  }
});

// Watcher that triggers when a new search is run
watch(
  searches,
  () => {
    // Resolves with an array containing responses from all the searches that have been
    // resolved upto that instant.
    Promise.all(searches.value).then((responses) => {
      // `responses` and `searches` having the same length implies that all searches
      // have been resolved.
      if (searches.value.length === responses.length) {
        const latestResponse = responses[responses.length - 1];
        persistResultsToState(latestResponse.data.datasets);
      }
    });
  },
  { deep: true },
);

onMounted(() => {
  searches.value.push(searchResults());
});
</script>
