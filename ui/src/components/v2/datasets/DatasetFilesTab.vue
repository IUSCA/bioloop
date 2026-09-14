<template>
  <!-- Always shown. num_files is a stored count that can be absent or stale, so it does not
       decide whether the browser appears; an empty dataset lists no rows. -->
  <FileBrowser
    :dataset-id="props.dataset.resource_id"
    :show-download="canDownload"
    :list-files="datasetService.listFiles"
    :search-files="datasetService.searchFiles"
    :download-file-info="datasetService.getFileDownloadInfo"
  />
</template>

<script setup>
import datasetService from "@/services/v2/datasets";

const props = defineProps({
  dataset: { type: Object, required: true },
  canDownload: { type: Boolean, default: false },
});
</script>
