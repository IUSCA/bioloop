<template>Hello</template>

<script setup>
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();

nav.setNavItems([
  {
    label: "Stats/Tracking",
  },
]);
</script>
