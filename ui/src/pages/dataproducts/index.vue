<template>
  <dataset-list dtype="DATA_PRODUCT" label="Data Product"></dataset-list>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
const nav = useNavStore();

nav.setNavItems([{ label: "Data Products" }]);
</script>

<route lang="yaml">
meta:
  title: Data Products
  requiresRoles: ["operator", "admin"]
</route>
