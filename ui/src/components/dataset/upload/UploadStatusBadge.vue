<template>
  <!-- UPLOADING -->
  <div v-if="props.status === constants.UPLOAD_STATUSES.UPLOADING" class="flex items-center">
    <va-popover message="Uploading">
      <half-circle-spinner
        class="flex-none"
        :animation-duration="1000"
        :size="20"
        :color="colors.primary"
      />
    </va-popover>
  </div>

  <!-- UPLOADED — waiting for verification worker -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.UPLOADED" class="flex items-center">
    <va-popover message="Processing pending">
      <half-circle-spinner
        class="flex-none"
        :animation-duration="1000"
        :size="20"
        :color="colors.warning"
      />
    </va-popover>
  </div>

  <!-- VERIFYING -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.VERIFYING" class="flex items-center">
    <va-popover message="Verifying upload">
      <half-circle-spinner
        class="flex-none"
        :animation-duration="1000"
        :size="20"
        :color="colors.info"
      />
    </va-popover>
  </div>

  <!-- VERIFIED — worker finished, awaiting workflow trigger -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.VERIFIED" class="flex items-center">
    <va-popover message="Upload verified">
      <va-icon name="check_circle_outline" color="success" />
    </va-popover>
  </div>

  <!-- Integrated workflow running -->
  <div v-else-if="props.integratedStatus === 'ACTIVE'" class="flex items-center">
    <va-popover message="Registration in progress">
      <half-circle-spinner
        class="flex-none"
        :animation-duration="1000"
        :size="20"
        :color="colors.warning"
      />
    </va-popover>
  </div>

  <!-- Integrated workflow succeeded -->
  <div v-else-if="props.integratedStatus === 'SUCCESS'" class="flex items-center">
    <va-popover message="Registration completed successfully">
      <va-icon name="check_circle" color="success" />
    </va-popover>
  </div>

  <!-- Integrated workflow failed -->
  <div v-else-if="props.integratedStatus === 'FAILURE'" class="flex items-center">
    <va-popover message="Registration failed">
      <va-icon name="warning" color="warning" />
    </va-popover>
  </div>

  <!-- VERIFICATION_FAILED -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.VERIFICATION_FAILED" class="flex items-center">
    <va-popover :message="props.failureReason ? `Verification failed: ${props.failureReason}` : 'Upload verification failed'">
      <va-icon name="error" color="danger" />
    </va-popover>
  </div>

  <!-- PERMANENTLY_FAILED -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.PERMANENTLY_FAILED" class="flex items-center">
    <va-popover :message="props.failureReason ? `Permanently failed: ${props.failureReason}` : 'Upload permanently failed — all retries exhausted'">
      <va-icon name="error" color="danger" />
    </va-popover>
  </div>

  <!-- PROCESSING_FAILED -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.PROCESSING_FAILED" class="flex items-center">
    <va-popover :message="props.failureReason ? `Processing failed: ${props.failureReason}` : 'Processing failed'">
      <va-icon name="error" color="danger" />
    </va-popover>
  </div>

  <!-- PROCESSING — workflow triggered, not yet reflected in integrated_status -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.PROCESSING" class="flex items-center">
    <va-popover message="Processing">
      <half-circle-spinner
        class="flex-none"
        :animation-duration="1000"
        :size="20"
        :color="colors.warning"
      />
    </va-popover>
  </div>

  <!-- COMPLETE -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.COMPLETE" class="flex items-center">
    <va-popover message="Upload complete">
      <va-icon name="check_circle" color="success" />
    </va-popover>
  </div>

  <!-- UPLOAD_FAILED -->
  <div v-else-if="props.status === constants.UPLOAD_STATUSES.UPLOAD_FAILED" class="flex items-center">
    <va-popover :message="props.failureReason ? `Upload failed: ${props.failureReason}` : 'Upload failed'">
      <va-icon name="error" color="danger" />
    </va-popover>
  </div>

  <!-- Fallback: unknown / null status (upload log not yet available) -->
  <div v-else-if="props.status" class="flex items-center">
    <va-popover :message="`Status: ${props.status}`">
      <va-icon name="help_outline" color="secondary" />
    </va-popover>
  </div>
</template>

<script setup>
import { useColors } from 'vuestic-ui';
import { HalfCircleSpinner } from 'epic-spinners';
import constants from '@/constants';

const props = defineProps({
  /** Current upload_status value from dataset_upload_log */
  status: {
    type: String,
    default: null,
  },
  /** Result of wfService.get_integrated_workflow_status(dataset.workflows) */
  integratedStatus: {
    type: String,
    default: null,
  },
  /** Optional failure reason from upload_log.metadata.failure_reason */
  failureReason: {
    type: String,
    default: null,
  },
});

const { colors } = useColors();
</script>
