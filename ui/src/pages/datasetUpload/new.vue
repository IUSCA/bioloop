<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="
      !isFeatureEnabled({
        featureKey: 'uploads',
        hasRole: auth.hasRole,
      })
    "
  >
    This feature is currently disabled
  </va-alert>

  <div v-else class="w-full flex justify-center">
    <va-card class="flex-auto md:max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <UploadDatasetStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import { isFeatureEnabled } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";

const nav = useNavStore();
const auth = useAuthStore();

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
