<template>
  <div class="w-full flex justify-center">
    <va-card class="flex-auto max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <ImportStepper v-if="auth.isFeatureEnabled('import')" />
        <va-alert color="warning" v-else>
          <template #icon>
            <Icon icon="mdi:alert" class="text-xl" />
          </template>
          This feature is currently disabled
        </va-alert>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";

const auth = useAuthStore();

const nav = useNavStore();
nav.setNavItems([
  {
    label: "Import",
    to: "/datasets/import",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Import
</route>
