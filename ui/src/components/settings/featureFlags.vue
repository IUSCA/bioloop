<template>
  <va-card>
    <va-card-title>
      <div class="flex flex-nowrap items-center w-full">
        <span class="flex-auto text-lg"> Features </span>
      </div>
    </va-card-title>
    <va-card-content>
      <va-switch
        v-for="(feature, i) in features"
        :key="i"
        v-model="features[i].enabled"
        @update:model-value="(newValue) => updateFlag(feature.id, newValue)"
        :label="feature.label"
        :loading="loading"
      ></va-switch>
    </va-card-content>
  </va-card>
</template>

<script setup>
import { useFeatureFlagStore } from "@/stores/featureFlag";
import featureFlagService from "@/services/featureFlag";
import { storeToRefs } from "pinia";
import toast from "@/services/toast";
// todo
//  loading when store is not populated yet
//  loading when switch is toggled
const featureFlagStore = useFeatureFlagStore();
const { features } = storeToRefs(featureFlagStore);
const { updateFeatureFlag } = featureFlagStore;

const loading = ref(false);

const updateFlag = (id, newValue) => {
  console.log(`id: ${id}`);
  console.log(`arg:`);
  console.log(newValue);

  loading.value = true;
  featureFlagService
    .updateFeatureFlag(id, { enabled: newValue })
    .then((res) => {
      updateFeatureFlag(id, res.data);
    })
    .catch((err) => {
      toast.error("Could not update feature");
      console.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
};
</script>

<style scoped></style>
