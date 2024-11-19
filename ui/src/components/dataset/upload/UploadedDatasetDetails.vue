<template>
  <!-- Alert to be shown when an upload finishes successfully or encounters an error -->
  <va-alert
    v-if="props.isSubmissionAlertVisible"
    dense
    :icon="submissionAlertIcon"
    :color="props.submissionAlertColor"
  >
    {{ props.submissionAlert }}
  </va-alert>

  <!-- Details of the dataset being uploaded -->
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr v-if="props.selectingFiles || props.selectingDirectory">
          <td>Data Product</td>
          <td>
            <div v-if="props.dataset">
              <router-link
                :to="`/datasets/${props.dataset.id}`"
                target="_blank"
              >
                {{ props.dataset.name }}
              </router-link>
            </div>

            <UploadedDatasetName
              v-else
              v-model:dataset-name-input="datasetNameInput"
              :dataset-name="props.datasetName"
              :input-disabled="props.inputDisabled"
              :dataset-name-error="props.uploadedDataProductError"
              :dataset-name-error-messages="
                props.uploadedDataProductErrorMessages
              "
              :selecting-files="props.selectingFiles"
              :selecting-directory="props.selectingDirectory"
            />
          </td>
        </tr>

        <tr v-if="sourceRawData">
          <td>Source Raw Data</td>
          <td class="source-raw-data-name">
            <router-link :to="`/datasets/${sourceRawData?.id}`" target="_blank">
              {{ sourceRawData?.name }}
            </router-link>
          </td>
        </tr>

        <tr>
          <td>Status</td>
          <td>
            <UploadStatusIcon :submission-status="props.submissionStatus" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  // `dataset`: Dataset to be uploaded.
  dataset: {
    type: Object,
  },
  // `datasetName`: Pre-selected name for a dataset that is to be uploaded.
  // Used when a directory is being uploaded.
  datasetName: {
    type: String,
    default: "",
  },
  // `datasetNameInput`: User-entered name for a dataset that is to be
  // uploaded. Used when individual files are being uploaded.
  datasetNameInput: {
    type: String,
    required: true,
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
  selectingFiles: {
    type: Boolean,
    required: true,
  },
  selectingDirectory: {
    type: Boolean,
    required: true,
  },
  uploadedDataProductErrorMessages: {
    type: String,
    default: "",
  },
  uploadedDataProductError: {
    type: Boolean,
    default: false,
  },
  statusChipColor: {
    type: String,
    required: true,
  },
  submissionStatus: {
    type: String,
    required: true,
  },
  sourceRawData: {
    type: Array,
    default: () => [],
  },
  isSubmissionAlertVisible: {
    type: Boolean,
    default: false,
  },
  submissionAlert: {
    type: String,
  },
  submissionAlertColor: {
    type: String,
    default: "warning",
  },
});

const emit = defineEmits(["update:datasetNameInput"]);

const datasetNameInput = computed({
  get() {
    return props.datasetNameInput;
  },
  set(value) {
    emit("update:datasetNameInput", value);
  },
});

const sourceRawData = computed(() => props.sourceRawData[0]);
const submissionAlertIcon = computed(() => {
  return props.submissionAlertColor === "success" ? "check_circle" : "warning";
});
</script>

<style scoped>
.source-raw-data-name {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
}
</style>
