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

            <!--              :dataset-name="props.datasetName"-->
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

        <tr v-if="sourceRawData">
          <td>Source Raw Data</td>
          <td class="source-raw-data-name">
            <router-link :to="`/datasets/${sourceRawData?.id}`" target="_blank">
              {{ sourceRawData?.name }}
            </router-link>
          </td>
        </tr>

      <tr v-if="props.project">
        <td>Project</td>
        <td class="source-raw-data-name">
          <router-link :to="`/projects/${props.project.id}`" target="_blank">
            {{ props.project.name }}
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

const emit = defineEmits(["update:populatedDatasetName"]);

const datasetNameInput = computed({
  get() {
    return props.populatedDatasetName;
  },
  set(value) {
    emit("update:populatedDatasetName", value);
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
