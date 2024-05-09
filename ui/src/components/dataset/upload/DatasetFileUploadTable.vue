<template>
  <div class="flex-none">
    <va-file-upload
      class="w-full"
      label="File"
      upload-button-text="Select Files"
      drop-zone-text="Drop files here"
      dropzone
      :disabled="props.submitAttempted"
      @file-added="
        (files) => {
          // console.log('DatasetFileUploadTable - files');
          // console.log(files);
          emit('file-added', files);
        }
      "
    />

    <va-data-table
      v-if="!(props.isSubmissionAlertVisible || noFilesSelected)"
      :items="props.dataProductFiles"
      :columns="columns"
    >
      <template #cell(progress)="{ value }">
        <va-progress-circle
          :model-value="value ? parseInt(value, 10) : 0"
          size="small"
        >
          {{ value && value + "%" }}
        </va-progress-circle>
      </template>

      <template #cell(uploadStatus)="{ value }">
        <span class="flex justify-center">
          <va-popover
            v-if="value === config.upload_status.UPLOADED"
            message="Succeeded"
          >
            <va-icon name="check_circle_outline" color="success" />
          </va-popover>
          <va-popover
            v-if="value === config.upload_status.UPLOADING"
            message="Uploading"
          >
            <va-icon name="pending" color="info" />
          </va-popover>
          <va-popover
            v-if="value === config.upload_status.UPLOAD_FAILED"
            message="Failed"
          >
            <va-icon name="error_outline" color="danger" />
          </va-popover>
        </span>
      </template>

      <template #cell(actions)="{ rowIndex }">
        <div class="flex gap-1">
          <va-button
            preset="plain"
            icon="delete"
            color="danger"
            @click="removeFile(rowIndex)"
            :disabled="props.submitAttempted"
          />
        </div>
      </template>
    </va-data-table>
  </div>

  <!-- Alert for showing errors encountered during submission -->
  <va-alert
    v-if="props.isSubmissionAlertVisible"
    class="mt-5"
    :color="props.submissionAlertColor"
    border="left"
    dense
    >{{ props.submissionAlert }}
  </va-alert>

  <!-- Submitted values -->
  <va-card v-if="props.submitAttempted" class="mt-5">
    <va-card-title>
      <div class="flex flex-nowrap items-center w-full">
        <span class="text-lg">Details</span>
      </div>
    </va-card-title>
    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table">
          <tbody>
            <tr>
              <td>Status</td>
              <td>
                <va-chip size="small" :color="props.statusChipColor">
                  {{ props.submissionStatus }}
                </va-chip>
              </td>
            </tr>
            <tr>
              <td>Data Product Name</td>
              <td>{{ props.datasetName }}</td>
            </tr>
            <tr>
              <td>File Type</td>
              <td>
                <va-chip outline small class="mr-2">{{
                  props.fileType.name
                }}</va-chip>
                <va-chip outline small>{{ props.fileType.extension }}</va-chip>
              </td>
            </tr>
            <tr>
              <td>Source Raw Data</td>
              <td>
                <span>
                  <router-link
                    :to="`/datasets/${props.sourceRawData.id}`"
                    target="_blank"
                  >
                    {{ props.sourceRawData.name }}
                  </router-link>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import config from "@/config";
import _ from "lodash";
import { formatBytes } from "@/services/utils";

const props = defineProps({
  dataProductFiles: {
    type: Array,
    required: true,
  },
  datasetName: {
    type: String,
    required: true,
  },
  sourceRawData: {
    type: Object,
    required: true,
  },
  fileType: {
    type: Object,
    required: true,
  },
  statusChipColor: {
    type: String,
    required: true,
  },
  submissionStatus: {
    type: String,
    required: true,
  },
  isSubmissionAlertVisible: {
    type: Boolean,
    required: true,
  },
  submissionAlert: {
    type: String,
    required: true,
  },
  submitAttempted: {
    type: Boolean,
    required: true,
  },
  submissionAlertColor: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["file-added", "remove-file"]);

const { SUBMISSION_STATES } = config;

// const dataProductFiles = ref([]);
// const isSubmissionAlertVisible = ref(false);
// const submissionAlert = ref();

const noFilesSelected = computed(() => {
  return props.dataProductFiles.length === 0;
});

const columns = [
  { key: "name" },
  { key: "formattedSize", label: "Size" },
  {
    key: "uploadStatus",
    label: "Status",
    thAlign: "center",
    tdAlign: "center",
  },
  { key: "progress" },
  { key: "actions", width: "80px" },
];

const removeFile = (index) => {
  // dataProductFiles.value.splice(index, 1);
  emit("remove-file", index);
};
</script>

<style scoped></style>
