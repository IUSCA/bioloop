<template>
  <div class="flex flex-col gap-2">
    <!--    <div :key="i" v-for="(result, i) in selectedResults">-->
    <!--      {{ result["text"] }} is selected-->
    <!--    </div>-->

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
  </div>
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

// const initialId = ref(1);

const mockResults = (start, end, suffix) =>
  _.range(start, end).map((i) => ({
    text: suffix
      ? `Result ${i + 1} for keyword '${suffix}'`
      : `Result ${i + 1}`,
    other: suffix
      ? `Some other val for result ${i + 1} for keyword ${suffix}`
      : `Some other val for result ${i + 1}`,
  }));

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
