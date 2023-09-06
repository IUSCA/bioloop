<template>
  <dataset-list dtype="RAW_DATA" label="Raw Data"></dataset-list>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
const nav = useNavStore();

nav.setNavItems([{ label: "Raw Data" }]);
</script>

<route lang="yaml">
meta:
  title: Raw Data
  requiresRoles: ["operator", "admin"]
</route>
