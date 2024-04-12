<template>
  <div class="flex flex-col items-center gap-2">
    <div><i-mdi-zip-box-outline class="text-3xl" /></div>
    <span class="text-xl tracking-wide">
      {{ config.dataset.types[props.dataset.type]?.label }} /
      {{ props.dataset.name }}
    </span>
  </div>
</template>

<script setup>
import config from "@/config";

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});
</script>

<style scoped></style>
