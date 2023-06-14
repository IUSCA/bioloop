<template>
  <!-- check if props.data is neither null or undefined -->
  <span v-if="props.data != null">
    {{ props.data }}
  </span>

  <!-- if props.data is null / undefined and props.default is not null or undefined -->
  <span v-if="props.data == null && props.default != null">
    {{ props.default }}
  </span>
</template>

<script setup>
const props = defineProps(["data", "default"]);
</script>
