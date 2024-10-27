<template>
  <!-- Upload buttons -->
  <div class="flex flex-row">
    <va-file-upload
      class="w-full"
      label="File"
      upload-button-text="Select Files"
      dropzone
      dropZoneText=""
      :disabled="props.submitAttempted"
      @file-added="
        (f) => {
          showUploadedDatasetProductCopyText = false;
          showUploadedDatasetSearchInput = true;
          emit('files-added', f);
          console.log('Files added:', f);
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
                showUploadedDatasetSearchInput = false;
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

  <!-- File list table, upload details, and file input -->
  <div class="flex flex-row">
    <va-data-table
      v-if="!(props.isSubmissionAlertVisible || noFilesSelected)"
      :items="props.files"
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

    <va-divider vertical />
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
</template>

<script setup>
import config from "@/config";

const props = defineProps({
  dataProductDirectory: {
    type: Object,
  },
  files: {
    type: Array,
    default: () => [],
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
  selectingFiles: {
    type: Boolean,
    required: true,
  },
  selectingDirectory: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["files-added", "directory-added", "file-removed"]);

const folderUploadInput = ref(null);

let directoryName = ref("");
const showUploadedDatasetProductCopyText = ref(false);
const showUploadedDatasetSearchInput = ref(false);

const isDirectory = computed(() => {
  return directoryName.value && directoryName.value.length > 0;
});

// const _fileTableItems = ref([]);

// const _fileTableItems = computed(() => {
//   debugger;
//   return [props.dataProductDirectory];
// });

// const fileTableItems = computed(() => {
//   return props.selectingFiles ? props.files : [props.dataProductDirectory];
// });

// const fileTableItems = computed(() => {
// return isDirectory.value ? [props.dataProductDirectory] :
// props.files; });

const noFilesSelected = computed(() => {
  return props.files.length === 0;
});

const columns = [
  {
    key: "name",
    label: "File",
    width: "40%",
    thAlign: "left",
    tdAlign: "left",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "formattedSize",
    label: "Size",
    width: "10%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "uploadStatus",
    label: "Status",
    width: "30%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  { key: "progress", width: "15%" },
  { key: "actions", width: "5%" },
];

const onDirectorySelection = (e) => {
  showUploadedDatasetProductCopyText.value = true;

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
