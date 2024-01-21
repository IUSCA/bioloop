<template>
  <div class="flex flex-col gap-2">
    <!--    <div :key="i" v-for="(result, i) in selectedResults">-->
    <!--      {{ result["text"] }} is selected-->
    <!--    </div>-->

    <AdvancedSearch
      :search-result-columns="searchColumnsConfig"
      :selected-result-columns="selectedColumnsConfig"
      :fetch-fn="fetchFn"
      search-field="text"
      @select="
        (selections) => (selectedResults = selectedResults.concat(selections))
      "
      @remove="
        (removals) => {
          removals.forEach((e) =>
            selectedResults.splice(selectedResults.indexOf(e), 1),
          );
        }
      "
      results-by="currentResults"
      count-by="totalResultCount"
    />
  </div>
</template>

<script setup>
import _ from "lodash";

const selectedResults = ref([]);

const fetchFn = ({ offset, limit }) => {
  return new Promise((resolve) => {
    resolve({
      data: {
        currentResults: mockResults(offset, offset + limit),
        totalResultCount: 50,
      },
    });
  });
};

const mockResults = (start, end) =>
  _.range(start, end).map((i) => ({
    text: `Result row ${i}`,
    index: i,
  }));

const searchColumnsConfig = [
  {
    key: "text",
    label: "Text",
  },
  {
    key: "index",
    label: "Index",
  },
];

const selectedColumnsConfig = searchColumnsConfig[0];
</script>

<style scoped></style>
