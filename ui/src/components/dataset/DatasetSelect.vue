<template>
  <AutoComplete
    :async="true"
    :data="datasets"
    placeholder="Search datasets by name"
    @update-search="updateSearch"
    :loading="loading"
    :clearable="true"
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
  </AutoComplete>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";
import _ from "lodash";

const BASE_FILTER_QUERY = { sortBy: { name: "asc" }, limit: 5 };

const searches = ref([]); // array of Promises, where each Promise represents a search operation
const searchStack = ref([]); // stack that is pushed to when a search is started, and
// popped from when a search resolves
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

const search = (query) => {
  loading.value = true;
  searchStack.value.push(null);

  return new Promise((resolve) => {
    let response;
    datasetService
      .getAll(query || BASE_FILTER_QUERY)
      .then((res) => {
        response = res;
      })
      .catch((e) => {
        console.log(e);
      })
      .finally(() => {
        searchStack.value.pop();
        resolve(response); // always resolve. Enables recovery from network errors without
        // page refresh
      });
  });
};

// Watcher that triggers when a new search is run
watch(searchQuery, (value, oldValue) => {
  if (!_.isEqual(value, oldValue)) {
    searches.value.push(search(searchQuery.value));
  }
});

watch(
  searchStack,
  () => {
    // If stack is empty, all searches have been resolved
    if (searchStack.value.length === 0) {
      Promise.all(searches.value).then((responses) => {
        const latestResponse = responses[responses.length - 1];
        datasets.value = latestResponse.data.datasets;
        loading.value = false;
      });
    }
  },
  { deep: true },
);

onMounted(() => {
  searches.value.push(search());
});
</script>
