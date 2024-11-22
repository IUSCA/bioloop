<template>
  <div class="w-full flex justify-center">
    <va-card class="flex-auto max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <IngestionStepper v-if="isIngestionEnabled" />
        <va-alert color="warning" icon="warning" v-else
          >This feature is currently disabled</va-alert
        >
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const { hasRole } = auth;

const isIngestionEnabled =
  config.enabledFeatures.ingestion.enabledForRoles.some((role) =>
    hasRole(role),
  );

const nav = useNavStore();
nav.setNavItems([
  {
    label: "Ingest",
    to: "/datasets/ingest",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Ingest
  requiresRoles: ["operator", "admin"]
</route>
