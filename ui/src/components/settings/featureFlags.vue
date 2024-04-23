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
      ></va-switch>
    </va-card-content>
  </va-card>
</template>

<script setup>
import { useFeatureFlagStore } from "@/stores/featureFlag";
import featureFlagService from "@/services/featureFlag";
import { storeToRefs } from "pinia";
// todo
//  loading when store is not populated yet
//  loading when switch is toggled
const featureFlagStore = useFeatureFlagStore();
const { features } = storeToRefs(featureFlagStore);
const { updateFeatureFlag } = featureFlagStore;

const updateFlag = (id, newValue) => {
  console.log(`id: ${id}`);
  console.log(`arg:`);
  console.log(newValue);

  featureFlagService
    .updateFeatureFlag(id, { enabled: newValue })
    .then((res) => {
      updateFeatureFlag(id, res.data);
    });
};
</script>

<style scoped></style>
