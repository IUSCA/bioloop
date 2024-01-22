<template>
  <AdvancedSearch
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    :selected-results="selectedResults"
    :fetch-fn="fetchFn"
    search-field="text"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    results-by="currentResults"
    count-by="totalResultCount"
  />
</template>

<script setup>
import _ from "lodash";

const selectedResults = ref([]);

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

const fetchFn = ({ text, offset, limit }) => {
  return new Promise((resolve) => {
    resolve({
      data: {
        currentResults: mockResults(offset, offset + limit, text),
        totalResultCount: 50,
      },
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
