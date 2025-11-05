<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="!auth.isFeatureEnabled('uploads')"
    data-testid="upload-feature-disabled-alert"
  >
    This feature is currently disabled
  </va-alert>

  <div v-else class="w-full flex justify-center" data-testid="upload-container">
    <va-card
      class="flex-auto md:max-w-5xl md:h-[calc(85vh)]"
      data-testid="upload-card"
    >
      <va-card-content class="h-full" data-testid="upload-card-content">
        <UploadDatasetStepper data-testid="upload-dataset-stepper" />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
const auth = useAuthStore();

nav.setNavItems([
  {
    label: "Dataset Uploads",
    to: "/datasetUpload",
  },
  {
    label: "Upload New",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Dataset Uploads
</route>
