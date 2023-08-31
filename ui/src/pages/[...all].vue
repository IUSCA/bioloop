<template>
  <div class="va-h1 font-semibold text-gray-700 dark:text-gray-300">
    This page's gone fishing.
  </div>
  <div class="va-text-secondary">
    If you feel that it's not right, please send us a message at
    <a class="va-link" :href="`mailto:${config.contact.sca_admin}`">{{
      config.contact.sca_admin
    }}</a>
  </div>
</template>

<script setup>
import config from "@/config";
</script>

<route lang="yaml">
meta:
  layout: 404
  title: Not Found
</route>
