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
        selectValue = ''; // reset Filter
      }
    "
  >
    <template #filters>
      <div class="max-w-xs">
        <VaSelect
          v-model="selectValue"
          :options="selectOptions"
          placeholder="Select an option"
          label="Filter Dropdown"
        />
      </div>
    </template>
  </SearchAndSelect>
</template>

<script setup>
import _ from "lodash";

const PAGE_SIZE = 10;

const selectValue = ref("");
const selectOptions = ref([1, 2, 3]);

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

const filterQuery = computed(() => {
  return selectValue.value
    ? {
        other: selectValue.value,
      }
    : undefined;
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { text: searchTerm.value }),
    ...filterQuery.value,
    ...batchingQuery.value,
  };
});

const loadResults = () => {
  return fetchFn(fetchQuery.value).then((res) => {
    searchResults.value = searchResults.value.concat(res.currentResults);
    totalResultCount.value = res.totalResultCount;
  });
};

watch([searchTerm, filterQuery], () => {
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

const fetchFn = ({ text, offset, limit, other }) => {
  return new Promise((resolve) => {
    resolve({
      currentResults: mockResults(offset, offset + limit, text, other),
      totalResultCount: 50,
    });
  });
};

const mockRow = (i, searchTerm, filterValue) => {
  const filterSuffix = (searchTerm, dropdownVal) => {
    return (
      (searchTerm ? `, for keyword '${searchTerm}'` : "") +
      (dropdownVal
        ? `, ${searchTerm ? "and" : "for"} dropdown ${dropdownVal}`
        : "")
    );
  };

  let text = (i) => `Result ${i + 1}` + filterSuffix(searchTerm, filterValue);

  const other = (i) =>
    `Other val for result ${i + 1}` + filterSuffix(searchTerm, filterValue);

  return {
    text: text(i),
    other: other(i),
  };
};

const mockResults = (start, end, searchTerm, filterValue) => {
  return _.range(start, end).map((i) => mockRow(i, searchTerm, filterValue));
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
