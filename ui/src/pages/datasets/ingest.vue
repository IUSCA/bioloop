<template>
  <div class="w-full flex justify-center">
    <va-card class="flex-auto max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <IngestionStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";

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
