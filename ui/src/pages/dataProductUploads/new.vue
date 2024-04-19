<template>
  <div class="w-full flex justify-center">
    <va-card class="flex-auto md:max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <UploadDatasetStepperNew />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import UploadDatasetStepperNew from "@/components/dataset/upload/UploadDatasetStepperNew.vue";

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
