<template>
  <RouterView />
</template>

<script setup>
import { useAuthStore } from "./stores/auth";
const auth = useAuthStore();
onBeforeMount(() => {
  auth.initialize();
});
</script>
