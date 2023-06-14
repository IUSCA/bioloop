<template>
  <div class="flex">
    <va-input type="text" readonly :model-value="props.text" class="" />
    <CopyButton class="flex-none" :text="props.text" />
  </div>
</template>

<script setup>
const props = defineProps({
  text: String,
});
</script>
