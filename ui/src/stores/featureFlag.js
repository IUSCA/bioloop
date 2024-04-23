import { ref } from "vue";
import { defineStore } from "pinia";
import featureFlagService from "@/services/featureFlag";
import toast from "@/services/toast";

export const useFeatureFlagStore = defineStore("featureFlag", () => {
  const loadingFeatureFlags = ref(false);
  const features = ref([]);

  function fetchFeatureFlags() {
    loadingFeatureFlags.value = true;
    featureFlagService
      .getAll()
      .then((res) => {
        setFeatures(res.data);
      })
      .catch((err) => {
        toast.error("Could not fetch feature flags");
        console.error(err);
      })
      .finally(() => {
        loadingFeatureFlags.value = false;
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

  return {
    features,
    setFeatures,
    updateFeatureFlag,
    fetchFeatureFlags,
    loadingFeatureFlags,
  };
});
