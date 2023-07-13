<template>
  <h2 class="text-3xl mb-4">Data Products</h2>
  <dataset-list dtype="DATA_PRODUCT" label="Data Product"></dataset-list>
</template>

<script setup></script>

<route lang="yaml">
meta:
  title: Data Products
  requiresRoles: ["operator", "admin"]
</route>
