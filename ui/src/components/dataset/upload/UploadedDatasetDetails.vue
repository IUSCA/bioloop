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
        <tr>
          <td>Dataset Name</td>
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
              v-model:populated-dataset-name="datasetNameInput"
              :input-disabled="props.inputDisabled"
              :dataset-name-error="props.uploadedDataProductError"
              :dataset-name-error-messages="
                props.uploadedDataProductErrorMessages
              "
            />
          </td>
        </tr>

        <tr>
          <td>Dataset Type</td>
          <td>
            <va-chip size="small" outline>
              {{ props.selectedDatasetType }}
            </va-chip>
          </td>
        </tr>

        <tr>
          <td>Source Raw Data</td>
          <td class="metadata">
            <router-link
              :to="`/datasets/${props.sourceRawData?.id}`"
              target="_blank"
            >
              {{ props.sourceRawData?.name }}
            </router-link>
          </td>
        </tr>

        <tr>
          <td>Project</td>
          <td class="metadata">
            <router-link :to="`/projects/${props.project?.id}`" target="_blank">
              {{ props.project?.name }}
            </router-link>
          </td>
        </tr>

        <tr>
          <td>Source Instrument</td>
          <td class="metadata">
            {{ props.sourceInstrument?.name }}
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
  selectedDatasetType: {
    type: String,
    required: true,
  },
  populatedDatasetName: {
    type: String,
    default: "",
  },
  project: {
    type: Object,
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
  sourceInstrument: {
    type: Object,
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
    type: Object,
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

const emit = defineEmits(["update:populatedDatasetName"]);

const datasetNameInput = computed({
  get() {
    return props.populatedDatasetName;
  },
  set(value) {
    emit("update:populatedDatasetName", value);
  },
});

// const sourceRawData = computed(() => props.sourceRawData[0]);
const submissionAlertIcon = computed(() => {
  return props.submissionAlertColor === "success" ? "check_circle" : "warning";
});
</script>

<style scoped>
.metadata {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
}
</style>
