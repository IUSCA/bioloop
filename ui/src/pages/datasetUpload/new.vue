<template>
  <div class="w-full flex justify-center">
    <va-card class="flex-auto md:max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <UploadDatasetStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();

nav.setNavItems([
  {
    label: "Dataset Upload",
    to: "/datasetUpload",
  },
  {
    label: "Upload Dataset",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Data Product Uploads
  requiresRoles: ["operator", "admin"]
</route>
