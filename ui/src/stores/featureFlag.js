import { ref } from "vue";
import { defineStore } from "pinia";
import featureFlagService from "@/services/featureFlag";

export const useFeatureFlagStore = defineStore("featureFlag", () => {
  const features = ref([]);

  function fetchFeatureFlags() {
    featureFlagService.getAll().then((res) => {
      setFeatures(res.data);
    });
  }

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

  return { features, setFeatures, updateFeatureFlag, fetchFeatureFlags };
});
