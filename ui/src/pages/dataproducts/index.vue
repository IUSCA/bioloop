<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="!auth.isFeatureEnabled('dataProducts')"
    data-testid="data-products-feature-disabled-alert"
  >
    This feature is currently disabled
  </va-alert>

  <div v-else data-testid="data-products-list">
    <dataset-list dtype="DATA_PRODUCT" label="Data Product"></dataset-list>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<route lang="yaml">
meta:
  title: Data Products
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Data Products" }]
</route>
