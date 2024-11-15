<template>
  <div class="flex flex-row">
    <va-file-upload
      class="w-full"
      label="File"
      upload-button-text="Select Files"
      dropzone
      dropZoneText=""
      :disabled="props.disabled"
      @file-added="
        (f) => {
          emit('files-added', f);
        }
      "
    />

    <div
      class="va-file-upload va-file-upload--dropzone w-full folder-upload--container"
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
            :disabled="props.disabled"
            @change="
              (e) => {
                onDirectorySelection(e);
              }
            "
          />
          <va-button
            :disabled="props.disabled"
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
</template>

<script setup>
const props = defineProps({
  disabled: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["files-added", "directory-added"]);

const onDirectorySelection = (e) => {
  if (e.target.files.length === 0) {
    return;
  }

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

  const directoryName = isWindows(filePath)
    ? filePath.slice(0, filePath.indexOf("\\"))
    : filePath.slice(0, filePath.indexOf("/"));

  emit("directory-added", {
    directoryName: directoryName,
    files: Array.from(e.target.files).map((file) => {
      file.path = getFilePath(file);
      return file;
    }),
  });
};

const folderUploadInput = ref(null);
</script>

<style scoped>
.folder-upload--input {
  display: none;
}

.folder-upload--container {
  cursor: default;
}
</style>
