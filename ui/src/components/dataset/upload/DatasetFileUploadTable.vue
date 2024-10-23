<template>
  <div class="flex flex-row">
    <va-file-upload
      class="w-full"
      label="File"
      upload-button-text="Select Files"
      dropzone
      dropZoneText=""
      :disabled="props.submitAttempted"
      @file-added="
        (files) => {
          emit('files-added', files);
        }
      "
    />

    <div
      class="va-file-upload va-file-upload--dropzone w-full folder-upload--container"
      label="File"
      style="background-color: rgba(51, 114, 240, 0.08)"
    >
      <div class="va-file-upload__field">
        <div class="va-file-upload__field__text">
          <input
            label="Choose Folder"
            ref="folderUploadInput"
            class="folder-upload--input"
            id="folder-upload--input"
            type="file"
            directory
            webkitdirectory
            multiple
            :disabled="props.submitAttempted"
            @change="
              (e) => {
                onDirectorySelection(e);
              }
            "
          />
          <va-button
            :disabled="props.submitAttempted"
            @click="
              () => {
                folderUploadInput.click();
              }
            "
          >
            Select Folder
          </va-button>
        </div>
      </div>
    </div>
  </div>

  <va-data-table
    v-if="!(props.isSubmissionAlertVisible || noFilesSelected)"
    :items="isDirectory ? [props.dataProductDirectory] : props.dataProductFiles"
    :columns="columns"
  >
    <template #cell(name)="{ rowData }">
      <div
        v-if="rowData.type === 'directory'"
        class="flex items-center gap-1 text-left"
      >
        <Icon icon="mdi-folder" class="text-xl flex-none text-gray-700" />
        <span> {{ rowData.name }} </span>
      </div>
    </template>

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
            <tr v-if="props.sourceRawData">
              <td>Source Raw Data</td>
              <td>
                <span>
                  <router-link
                    :to="`/datasets/${props.sourceRawData?.id}`"
                    target="_blank"
                  >
                    {{ props.sourceRawData?.name }}
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

const props = defineProps({
  dataProductDirectory: {
    type: Object,
  },
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

const emit = defineEmits(["files-added", "directory-added", "file-removed"]);

const folderUploadInput = ref(null);

let directoryName = ref("");

const isDirectory = computed(() => {
  return directoryName.value && directoryName.value.length > 0;
});

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

const onDirectorySelection = (e) => {
  const isWindows = (path) =>
    path.indexOf("/") === -1 && path.indexOf("\\") > 0;
  const isUnix = (path) => path.indexOf("//") === -1 && path.indexOf("/") > 0;

  const getFilePath = (file) => {
    return isUnix(file.webkitRelativePath)
      ? file.webkitRelativePath.slice(
          0,
          file.webkitRelativePath.lastIndexOf("/"),
        )
      : file.webkitRelativePath
          .slice(0, file.webkitRelativePath.lastIndexOf("\\"))
          .replace(/\\/g, "/");
  };

  // The webkitRelativePath property of any of the selected files can be used
  // to determine if the client is running on Windows or Unix.
  const filePath = e.target.files[0]?.webkitRelativePath || "";

  directoryName.value = isWindows(filePath)
    ? filePath.slice(0, filePath.indexOf("\\"))
    : filePath.slice(0, filePath.indexOf("/"));

  emit("directory-added", {
    directoryName: directoryName.value,
    files: Array.from(e.target.files).map((file) => {
      file.path = getFilePath(file);
      return file;
    }),
  });
};

const removeFile = (index) => {
  emit("file-removed", index);
};
</script>

<style scoped>
.folder-upload--input {
  display: none;
}

.folder-upload--container {
  cursor: default;
}
</style>
