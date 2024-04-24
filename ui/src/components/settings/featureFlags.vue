<template>
  <!-- List of features -->
  <va-card>
    <va-card-title>
      <div class="flex flex-nowrap items-center w-full">
        <span class="flex-auto text-lg"> Enabled Features </span>
        <AddEditButton :show-text="true" @click="openModalToAddFeatureFlag" />
      </div>
    </va-card-title>
    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table">
          <tbody>
            <tr v-for="(feature, i) in features" :key="i">
              <td>{{ feature.label }}</td>
              <td>
                <va-switch
                  v-model="features[i].enabled"
                  @update:model-value="
                    (newValue) => updateFlag(feature.id, newValue)
                  "
                  :loading="loadingFeatureFlags"
                ></va-switch>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>

  <!-- Modal to add new feature -->
  <va-modal
    title="Add New Feature"
    v-model="isModalOpen"
    hide-default-actions
    @before-close="resetModalInputs"
    @before-cancel="resetModalInputs"
  >
    <div class="flex flex-col gap-6">
      <va-input
        :disabled="loadingFeatureFlags"
        v-model="newFeatureName"
        label="Feature"
      ></va-input>
      <va-switch
        :disabled="loadingFeatureFlags"
        v-model="newFeatureEnabled"
        label="Enabled"
      ></va-switch>

      <div class="flex flex-row-reverse gap-3">
        <va-button @click="addFeatureFlag" :disabled="loadingFeatureFlags"
          >OK</va-button
        >
        <va-button
          class="va-text-secondary"
          preset="secondary"
          @click="closeModalToAddFeatureFlag"
          :disabled="loadingFeatureFlags"
          >Cancel</va-button
        >
      </div>
    </div>
  </va-modal>
</template>

<script setup>
import { useFeatureFlagStore } from "@/stores/featureFlag";
import featureFlagService from "@/services/featureFlag";
import { storeToRefs } from "pinia";
import toast from "@/services/toast";

const featureFlagStore = useFeatureFlagStore();
const { features, loadingFeatureFlags } = storeToRefs(featureFlagStore);
const { createFeatureFlag, updateFeatureFlag } = featureFlagStore;

const newFeatureName = ref("");
const newFeatureEnabled = ref(true);
const isModalOpen = ref(false);
// const loading = ref(false);

const openModalToAddFeatureFlag = () => {
  isModalOpen.value = true;
};

const closeModalToAddFeatureFlag = () => {
  isModalOpen.value = false;
};

const resetModalInputs = () => {
  newFeatureName.value = "";
  newFeatureEnabled.value = true;
};

// todo - validation for "feature already exists"
const addFeatureFlag = () => {
  createFeatureFlag(newFeatureName.value, newFeatureEnabled.value).then(() => {
    // resetModalInputs()
    closeModalToAddFeatureFlag();
  });
};

const updateFlag = (id, newValue) => {
  updateFeatureFlag(id, { enabled: newValue });
};
</script>

<style scoped></style>
