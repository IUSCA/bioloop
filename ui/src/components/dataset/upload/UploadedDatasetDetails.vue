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
              <div v-if="!auth.canOperate">
                {{ props.dataset.name }}
              </div>
              <router-link
                v-else
                :to="`/datasets/${props.dataset.id}`"
                target="_blank"
              >
                {{ props.dataset.name }}
              </router-link>
            </div>
            <DatasetNameInput
              v-else
              v-model:populated-dataset-name="datasetNameInput"
              class="w-full"
              :input-disabled="props.inputDisabled"
              :error="props.datasetNameError"
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
            <div v-if="props.project">
              <router-link
                :to="`/projects/${props.project.id}`"
                target="_blank"
              >
                {{ props.project.name }}
              </router-link>
            </div>
            <OutlinedAlert
              v-else-if="props.creatingNewProject"
              color="secondary"
              border="left"
              size="medium"
              padding-direction="left"
              padding-amount="sm"
              icon="info"
            >
              A new Project will be created
            </OutlinedAlert>
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
import { useAuthStore } from "@/stores/auth";
import OutlinedAlert from "@/components/utils/OutlinedAlert.vue";

const props = defineProps({
  // `dataset`: Dataset to be uploaded
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
  creatingNewProject: {
    type: Boolean,
    default: false,
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
  sourceInstrument: {
    type: Object,
  },
  datasetNameError: {
    type: String,
    default: "",
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

const auth = useAuthStore();

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
