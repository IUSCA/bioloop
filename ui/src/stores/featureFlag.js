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

  function _updateFeatureFlag(id, updatedFeature) {
    const featureIndex = features.value.findIndex(
      (feature) => feature.id === id,
    );
    if (featureIndex >= 0) {
      features.value[featureIndex] = updatedFeature;
    }
  }

  function updateFeatureFlag(id, updatedFeature) {
    loadingFeatureFlags.value = true;
    return featureFlagService
      .updateFeatureFlag(id, updatedFeature)
      .then((res) => {
        _updateFeatureFlag(id, res.data);
      })
      .catch((err) => {
        toast.error("Could not update feature");
        console.error(err);
      })
      .finally(() => {
        loadingFeatureFlags.value = false;
      });
  }

  function addFeatureFlag(feature) {
    features.value.push(feature);
  }

  function createFeatureFlag(label, enabled = false) {
    loadingFeatureFlags.value = true;
    return featureFlagService
      .createFeatureFlag(label, enabled)
      .then((res) => {
        addFeatureFlag(res.data);
      })
      .catch((err) => {
        toast.error("Could not create feature");
        console.error(err);
      })
      .finally(() => {
        loadingFeatureFlags.value = false;
      });
  }

  return {
    features,
    // setFeatures,
    updateFeatureFlag,
    createFeatureFlag,
    fetchFeatureFlags,
    loadingFeatureFlags,
  };
});
