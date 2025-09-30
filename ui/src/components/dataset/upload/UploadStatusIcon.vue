<template>
  <div
    v-if="props.submissionStatus === constants.UPLOAD_STATUSES.UPLOADING"
    class="flex items-center space-x-2"
    data-testid="status-uploading"
  >
    <Icon
      v-if="props.showIcon"
      icon="mdi:arrow-up-bold"
      class="animate-bounce va-text-primary text-2xl"
      data-testid="icon-uploading"
    />
    <va-chip size="small" data-testid="chip-uploading">Uploading</va-chip>
  </div>

  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATUSES.PROCESSING"
    class="flex items-center space-x-2"
    data-testid="status-processing"
  >
    <va-icon
      v-if="props.showIcon"
      class="text-2xl"
      name="loop"
      spin="clockwise"
      color="primary"
      data-testid="icon-processing"
    />
    <va-chip size="small" data-testid="chip-processing">Processing</va-chip>
  </div>

  <div
    v-else-if="
      props.submissionStatus === constants.UPLOAD_STATUSES.COMPUTING_CHECKSUMS
    "
    class="flex items-center space-x-2"
    data-testid="status-computing-checksums"
  >
    <i-mdi-progress-helper
      v-if="props.showIcon"
      style="color: var(--va-primary)"
      class="animate-spin text-2xl"
      data-testid="icon-computing-checksums"
    />
    <va-chip size="small" data-testid="chip-computing-checksums">
      Computing Checksums
    </va-chip>
  </div>

  <div
    v-else-if="
      props.submissionStatus ===
      constants.UPLOAD_STATUSES.CHECKSUM_COMPUTATION_FAILED
    "
    class="flex items-center space-x-2"
    data-testid="status-checksum-computation-failed"
  >
    <i-mdi-alert-circle-outline
      class="text-2xl"
      v-if="props.showIcon"
      style="color: var(--va-warning)"
      data-testid="icon-checksum-computation-failed"
    />
    <va-chip
      size="small"
      color="warning"
      data-testid="chip-checksum-computation-failed"
    >
      Checksum Computation Failed
    </va-chip>
  </div>

  <div
    v-else-if="
      props.submissionStatus === constants.UPLOAD_STATUSES.UPLOAD_FAILED
    "
    class="flex items-center space-x-2"
    data-testid="status-upload-failed"
  >
    <i-mdi-alert-circle-outline
      class="text-2xl"
      v-if="props.showIcon"
      style="color: var(--va-danger)"
      data-testid="icon-upload-failed"
    />
    <va-chip size="small" color="danger" data-testid="chip-upload-failed">
      Upload Failed
    </va-chip>
  </div>

  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATUSES.UPLOADED"
    class="flex items-center space-x-2"
    data-testid="status-uploaded"
  >
    <i-mdi-check-circle
      class="text-2xl"
      v-if="props.showIcon"
      style="color: var(--va-success)"
      data-testid="icon-uploaded"
    />
    <va-chip size="small" color="success" data-testid="chip-uploaded">
      Uploaded
    </va-chip>
  </div>
</template>

<script setup>
import constants from "@/constants";

const props = defineProps({
  submissionStatus: {
    type: String,
    required: true,
  },
  showIcon: {
    type: Boolean,
    default: true,
  },
});
</script>

<style scoped>
.animate-spin {
  animation: spin 2s linear infinite;
}
</style>
