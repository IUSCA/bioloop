<script setup>
import batchDownloadService from '@/services/batchDownload';

const batch_id = ref('')

const download = async () => {
  const results = await batchDownloadService.intiate_download(batch_id.value)

}


</script>

<template>

<!-- Input for path to script -->
<div class="flex flex-col justify-center items-center mt-2">
  <h1 class="text-2xl">Batch Download</h1>
  <div>

    <va-input label="Batch ID" v-model="batch_id" placeholder="Batch ID"  class="shadow my-2 mx-auto" />
  </div>
  <div>
    <va-button @click="download()" color="success" icon="download"   preset="secondary" border-color="success" class="shadow my-2 mx-auto" > Initiate Batch Download</va-button>
  </div>
</div>
</template>

<route lang="yaml">
  meta:
    title: Batch Download
    nav: [{ label: "Batch Download" }]
  </route>