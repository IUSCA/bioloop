<template>
  <AdvancedSearch
    placeholder="Test"
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
    :query="query"
  >
    <template #filters>
      <div class="max-w-xs">
        <VaSelect
          v-model="selectValue"
          :options="selectOptions"
          placeholder="Select an option"
        />
      </div>
    </template>
  </AdvancedSearch>
</template>

<script setup>
import _ from "lodash";

const selectedResults = ref([]);

const selectValue = ref("");
const selectOptions = ref([1, 2, 3]);

const query = computed(() => ({
  other: selectValue.value,
}));

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

const fetchFn = ({ text, other, offset, limit }) => {
  return new Promise((resolve) => {
    resolve({
      data: {
        currentResults: mockResults(offset, offset + limit, text, other),
        totalResultCount: 50,
      },
    });
  });
};

const mockRow = (i, searchTerm, dropdownVal) => {
  let id = 0;

  const getId = (searchTerm, dropdownVal) => {
    id++;
    return id;
  };

  let text = (i) => {
    return (
      (searchTerm
        ? `Result ${i + 1} for keyword '${searchTerm}'`
        : `Result ${i + 1}`) + (dropdownVal ? `, dropdown ${dropdownVal}` : "")
    );
  };

  const other = (i) => {
    return (
      (searchTerm
        ? `Other val for result ${i + 1} for keyword ${searchTerm}`
        : `Other val for result ${i + 1}`) +
      (dropdownVal ? `, dropdown '${dropdownVal}'` : "")
    );
  };

  return {
    id: "",
    text: text(i),
    other: other(i),
  };
};
const mockResults = (start, end, searchTerm, dropdownVal) => {
  return _.range(start, end).map((i) => mockRow(i, searchTerm, dropdownVal));
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
