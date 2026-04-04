<template>
  <VaCard>
    <VaCardContent>
      <FileBrowser
        :dataset-id="props.dataset.id"
        :show-download="canDownload"
      />
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const props = defineProps({
  dataset: { type: Object, required: true },
  canDownload: { type: Boolean, default: false },
});
</script>
