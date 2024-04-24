<template>
  <img
    :style="`width: ${props.size};`"
    :src="currentPresetName === 'dark' ? '/dark-logo.svg' : '/logo.svg'"
    alt="App logo"
  />
</template>

<script setup>
import { useColors } from "vuestic-ui";
const { currentPresetName } = useColors();

const props = defineProps({
  size: {
    type: String,
    default: "2rem",
  },
});
</script>
