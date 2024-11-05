<template>
  <div class="flex">
    <va-input type="text" readonly :model-value="props.text" class="flex-auto">
      <template #appendInner>
        <CopyButton :text="props.text" preset="plain" />
      </template>
    </va-input>
  </div>
</template>

<script setup>
const props = defineProps({
  text: String,
});
</script>
