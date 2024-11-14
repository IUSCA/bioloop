<template>
  <i-mdi-upload-circle
    v-if="props.submissionStatus === constants.UPLOAD_STATES.UPLOADING"
    style="color: var(--va-primary)"
  />

  <va-icon
    v-else-if="props.submissionStatus === constants.UPLOAD_STATES.PROCESSING"
    name="loop"
    spin="clockwise"
    color="primary"
  />

  <i-mdi-warning
    v-if="props.submissionStatus === constants.UPLOAD_STATES.UPLOAD_FAILED"
    style="color: var(--va-warning)"
  />

  <i-mdi-check-circle
    v-else-if="props.submissionStatus === constants.UPLOAD_STATES.UPLOADED"
    style="color: var(--va-success)"
  />
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

<style scoped></style>
