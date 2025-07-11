<template>
  <div class="flex flex-row" data-testid="upload-container">
    <va-file-upload
      class="w-full"
      label="File"
      upload-button-text="Select Files"
      dropzone
      dropZoneText=""
      :disabled="props.disabled"
      @file-added="onFileSelection"
      data-testid="upload-file-select"
    />

    <div
      class="va-file-upload va-file-upload--dropzone w-full folder-upload--container"
      style="background-color: rgba(51, 114, 240, 0.08)"
      data-testid="folder-upload-container"
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
            data-testid="folder-upload-input"
          />
          <va-button
            :disabled="props.disabled"
            @click="
              () => {
                folderUploadInput.click();
              }
            "
            data-testid="select-folder-button"
          >
            Select Directory
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

/**
 * Provided as a `ref` to a hidden HTML `input` element, which allows the browser's folder-selection window to appear
 * when a different visible element is clicked.
 * - This is used as a workaround to make the browser's folder-selection window appear.
 * The workaround is needed because Vuestic's `va-file-upload` component only supports file uploads, not folder uploads.
 */
const folderUploadInput = ref(null);

/**
 * Handles the selection of a file by the user.
 *
 * This function is triggered when a file is selected via the va-file-upload component.
 * It emits a 'files-added' event with the selected file information.
 *
 * @param {File} f - The File object representing the selected file.
 *   This object includes properties such as:
 *   - name: The name of the file.
 *   - size: The size of the file in bytes.
 *
 * @fires {CustomEvent} files-added - Emitted when a file is selected.
 *   The event detail contains the File object of the selected file.
 *
 * @returns {void}
 *
 * @example
 * <va-file-upload @file-added="onFileSelection" />
 */
const onFileSelection = (f) => {
  emit("files-added", f);
};

/**
 * Handles the selection of a directory by the user.
 *
 * This function processes the files from the selected directory,
 * determines the operating system (Windows or Unix) based on the file paths,
 * and emits a 'directory-added' event with the processed directory information.
 *
 * @param {Event} e - The change event from the directory input element.
 *
 * - `e.target.files` is a `FileList` object from which the list of files selected by the user can be retrieved.
 *
 * @fires {CustomEvent} directory-added - Emitted if the selected directory contains one or more files.
 *   The event details contain:
 *   - {string} directoryName - The name of the selected directory.
 *   - {File[]} files - An array of File objects, each representing a file in the selected directory.
 *     Each File object is augmented with a 'path' property containing the file's relative path.
 *
 * @returns {void}
 *
 * @example
 * <input type="file" webkitdirectory directory multiple @change="onDirectorySelection" />
 */
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
</script>

<style scoped>
.folder-upload--input {
  display: none;
}

.folder-upload--container {
  cursor: default;
}

/*
 Vuestic's `<va-file-upload />` component inserts a `div` with
 class `va-file-upload__field__text` in the DOM, whose default
 padding shifts the 'Select Files' button to the bottom on screen
 sizes below `md`. Setting the padding to `0` for all screen sizes
 resolves this issue on screen sizes `md` and below, without
 affecting the button's layout on larger screen sizes.
 */
.va-file-upload :deep(.va-file-upload__field__text) {
  padding: 0;
}
</style>
