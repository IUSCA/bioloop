<template>
  <h2 class="text-3xl mb-4">Raw Data</h2>
  <dataset-list dtype="RAW_DATA" label="Raw Data"></dataset-list>
</template>

<script setup></script>

<route lang="yaml">
meta:
  title: Raw Data
  requiresRoles: ["operator", "admin"]
</route>
