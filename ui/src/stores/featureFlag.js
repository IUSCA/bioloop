import { ref } from "vue";
import { defineStore } from "pinia";

export const useFeatureFlagStore = defineStore("featureFlag", () => {
  const features = ref([]);

  function setFeatures(value) {
    features.value = value;
  }

  return { features, setFeatures };
});
