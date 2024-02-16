<template>
  <DataProductIngestionStepper />
</template>

<script setup>
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
nav.setNavItems([
  {
    label: "Ingest",
    to: "/ingest",
  },
]);

const filePath = ref("");
</script>

<style scoped></style>
