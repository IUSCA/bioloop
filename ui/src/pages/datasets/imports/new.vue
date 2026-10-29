<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="!auth.isFeatureEnabled('import')"
  >
    This feature is currently disabled
  </va-alert>

  <div v-else class="w-full flex justify-center">
    <va-card class="flex-auto md:max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <ImportStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import ImportStepper from "@/components/dataset/import/ImportStepper.vue";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
const auth = useAuthStore();

nav.setNavItems([
  {
    label: "Dataset Imports",
    to: "/datasets/imports",
  },
  {
    label: "Import New",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Dataset Imports
</route>
