import { ref } from "vue";
import { defineStore } from "pinia";

export const useFeatureFlagStore = defineStore("featureFlag", () => {
  const features = ref([]);

  function setFeatures(value) {
    features.value = value;
  }

  function updateFeatureFlag(id, updatedFeature) {
    const featureIndex = features.value.findIndex(
      (feature) => feature.id === id,
    );
    if (featureIndex >= 0) {
      features.value[featureIndex] = updatedFeature;
    }
  }

  return { features, setFeatures, updateFeatureFlag };
});
