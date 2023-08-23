import { ref } from "vue";
import { defineStore } from "pinia";

export const useDatasetStore = defineStore("datasetStore", () => {
  const dataset = ref({});

  function setDataset(value) {
    dataset.value = value;
  }

  return {
    dataset,
    setDataset,
  };
});
