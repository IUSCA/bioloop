<template>
  <div class="w-full flex justify-center">
    <va-card class="md:max-w-2xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <UploadDatasetStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import UploadDatasetStepper from "@/components/dataset/upload/UploadDatasetStepper.vue";

const nav = useNavStore();

nav.setNavItems([
  {
    label: "Data Product Uploads",
    to: "/dataProductUploads",
  },
  {
    label: "Upload Data Product",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Data Product Uploads
  requiresRoles: ["operator", "admin"]
</route>
