<template>
  <FileBrowser
    v-if="hasFiles"
    :dataset-id="props.dataset.resource_id"
    :show-download="canDownload"
    :list-files="datasetService.listFiles"
    :search-files="datasetService.searchFiles"
  />

  <VaCard v-else>
    <VaCardContent>
      <div class="min-h-64"></div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import datasetService from "@/services/v2/datasets";

const props = defineProps({
  dataset: { type: Object, required: true },
  canDownload: { type: Boolean, default: false },
  hasFiles: { type: Boolean, default: false },
});
</script>
