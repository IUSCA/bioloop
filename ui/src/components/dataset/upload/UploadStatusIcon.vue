<template>
  <div
      v-if="props.submissionStatus === constants.UPLOAD_STATES.UPLOADING"
      class="flex items-center space-x-2"
  >
    <i-mdi-upload-circle
      style="color: var(--va-primary)"
    />
    <va-chip size="small">Uploading</va-chip>
  </div>


  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATES.PROCESSING"
    class="flex items-center space-x-2">
    <va-icon
      name="loop"
      spin="clockwise"
      color="primary"
    />
    <va-chip size="small">Processing</va-chip>
  </div>

  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATES.COMPUTING_CHECKSUMS"
    class="flex items-center space-x-2">
      <i-mdi-progress-helper
        style="color: var(--va-primary)"
        class="animate-spin"
      />
      <va-chip size="small">Computing Checksums</va-chip>
    </div>


  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATES.UPLOAD_FAILED"
    class="flex items-center space-x-2">
      <i-mdi-warning
        style="color: var(--va-warning)"
      />
      <va-chip size="small">Upload Failed</va-chip>
  </div>

      <div v-else-if="props.submissionStatus === constants.UPLOAD_STATES.UPLOADED"
          class="flex items-center space-x-2">

      <i-mdi-check-circle
        style="color: var(--va-success)"
      />
        <va-chip size="small">Uploaded</va-chip>
    </div>
</template>

<script setup>
import constants from "@/constants";

const props = defineProps({
  submissionStatus: {
    type: String,
    required: true,
  },
});
</script>

<style scoped>
.animate-spin {
  animation: spin 2s linear infinite;
}

</style>
