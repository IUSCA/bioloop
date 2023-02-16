<template>
  <span></span>
</template>

<script setup>
import config from "../config";

const route = useRoute();
console.log("auth query", route.query);

console.log(config.casReturn);

// window.location.replace()
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Auth
  requiresAuth: false
</route>
