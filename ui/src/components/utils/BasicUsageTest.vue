<template>
  <SearchAndSelect
    v-model:searchTerm="searchTerm"
    :search-results="searchResults"
    :selected-results="selectedResults"
    :search-result-count="totalResultCount"
    @scroll-end="loadNextPage"
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    @reset="
      () => {
        searchTerm = ''; // watcher on searchTerm takes care of resetting the search state
      }
    "
  />
</template>

<script setup>
import _ from "lodash";

const PAGE_SIZE = 10;

const selectedResults = ref([]);
const searchResults = ref([]);

const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});

const totalResultCount = ref(0);

const searchTerm = ref("");

const handleSelect = (selections) => {
  selections.forEach((selection) => {
    if (!selectedResults.value.includes(selection)) {
      selectedResults.value.push(selection);
    }
  });
};

const handleRemove = (removals) => {
  removals.forEach((e) =>
    selectedResults.value.splice(selectedResults.value.indexOf(e), 1),
  );
};

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { text: searchTerm.value }),
    ...batchingQuery.value,
  };
});

const loadResults = () => {
  return fetchFn(fetchQuery.value).then((res) => {
    searchResults.value = searchResults.value.concat(res.currentResults);
    totalResultCount.value = res.totalResultCount;
  });
};

watch(searchTerm, () => {
  resetSearchState();
});

const resetSearchState = () => {
  // reset search results
  searchResults.value = [];
  // reset page value
  page.value = 1;
  // load initial set of search results
  loadResults();
};

onMounted(() => {
  loadResults();
});

const fetchFn = ({ text, offset, limit }) => {
  return new Promise((resolve) => {
    resolve({
      currentResults: mockResults(offset, offset + limit, text),
      totalResultCount: 50,
    });
  });
};

const mockRow = (i, searchTerm) => {
  const filterSuffix = (searchTerm) => {
    return searchTerm ? `, for keyword '${searchTerm}'` : "";
  };

  let text = (i) => `Result ${i + 1}` + filterSuffix(searchTerm);

  const other = (i) =>
    `Other val for result ${i + 1}` + filterSuffix(searchTerm);

  return {
    text: text(i),
    other: other(i),
  };
};

const mockResults = (start, end, searchTerm) => {
  return _.range(start, end).map((i) => mockRow(i, searchTerm));
};

const searchColumnsConfig = [
  {
    key: "text",
    label: "Text",
    width: "350px",
  },
  {
    key: "other",
    label: "Other Field",
    width: "320px",
  },
];

const selectedColumnsConfig = [searchColumnsConfig[0]];
</script>
