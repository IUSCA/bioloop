<template>
  <!-- PROCESSING: pre-upload API call in progress — blue to match the upload section -->
  <div
    v-if="props.submissionStatus === constants.UPLOAD_STATUSES.PROCESSING"
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
    <va-chip size="small" color="primary" data-testid="chip-processing"
      >Processing</va-chip
    >
  </div>

  <!-- COMPUTING_CHECKSUMS: amber / fingerprint -->
  <div
    v-else-if="
      props.submissionStatus === constants.UPLOAD_STATUSES.COMPUTING_CHECKSUMS
    "
    class="flex items-center space-x-2"
    data-testid="status-computing-checksums"
  >
    <Icon
      v-if="props.showIcon"
      icon="mdi:fingerprint"
      class="animate-pulse text-2xl"
      style="color: var(--va-warning)"
      data-testid="icon-computing-checksums"
    />
    <va-chip
      size="small"
      color="warning"
      data-testid="chip-computing-checksums"
    >
      Computing Manifest-Hash
    </va-chip>
  </div>

  <!-- UPLOADING: blue / cloud-upload — mirrors the upload progress bar -->
  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATUSES.UPLOADING"
    class="flex items-center space-x-2"
    data-testid="status-uploading"
  >
    <Icon
      v-if="props.showIcon"
      icon="mdi:cloud-upload-outline"
      class="text-2xl va-text-primary"
      data-testid="icon-uploading"
    />
    <va-chip size="small" color="primary" data-testid="chip-uploading"
      >Uploading</va-chip
    >
  </div>

  <!-- CHECKSUM_COMPUTATION_FAILED: manifest-hash computation failed -->
  <div
    v-else-if="
      props.submissionStatus ===
      constants.UPLOAD_STATUSES.CHECKSUM_COMPUTATION_FAILED
    "
    class="flex items-center space-x-2"
    data-testid="status-checksum-computation-failed"
  >
    <Icon
      v-if="props.showIcon"
      icon="mdi:alert-circle-outline"
      class="text-2xl"
      style="color: var(--va-warning)"
      data-testid="icon-checksum-computation-failed"
    />
    <va-chip
      size="small"
      color="warning"
      data-testid="chip-checksum-computation-failed"
    >
      Manifest-Hash Failed
    </va-chip>
  </div>

  <!-- UPLOAD_FAILED -->
  <div
    v-else-if="
      props.submissionStatus === constants.UPLOAD_STATUSES.UPLOAD_FAILED
    "
    class="flex items-center space-x-2"
    data-testid="status-upload-failed"
  >
    <Icon
      v-if="props.showIcon"
      icon="mdi:alert-circle-outline"
      class="text-2xl"
      style="color: var(--va-danger)"
      data-testid="icon-upload-failed"
    />
    <va-chip size="small" color="danger" data-testid="chip-upload-failed">
      Upload Failed
    </va-chip>
  </div>

  <!-- UPLOADED -->
  <div
    v-else-if="props.submissionStatus === constants.UPLOAD_STATUSES.UPLOADED"
    class="flex items-center space-x-2"
    data-testid="status-uploaded"
  >
    <Icon
      v-if="props.showIcon"
      icon="mdi:check-circle"
      class="text-2xl"
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
import { Icon } from "@iconify/vue";

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
