<template>
  <dataset-list dtype="DATA_PRODUCT" label="Data Product"></dataset-list>
</template>

<script setup></script>

<route lang="yaml">
meta:
  title: Data Products
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Data Products" }]
</route>
