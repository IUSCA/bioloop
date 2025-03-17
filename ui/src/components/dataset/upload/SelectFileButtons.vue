<template>
<!-- todo -->
  <!--  alignment-->
  <!--Drag-n-drop-->
  <!-- - Don’t enable file drags in ‘select directory’ option-->

  <div class="flex flex-col sm:flex-row">
    <div class="w-full">
      <va-file-upload
        class="w-full upload-container"
        label="File"
        upload-button-text="Select Files"
        dropzone
        dropZoneText=""
        :disabled="props.disabled"
        @file-added="(f) => { emit('files-added', f); }"
      />
    </div>

    <div class="w-full">
      <div
        class="va-file-upload va-file-upload--dropzone w-full folder-upload--container"
        style="background-color: rgba(51, 114, 240, 0.08)"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="va-file-upload__field">
          <div class="va-file-upload__field__text">
            <input
              label="Choose Directory"
              ref="folderUploadInput"
              class="folder-upload--input"
              id="folder-upload--input"
              type="file"
              directory
              webkitdirectory
              multiple
              :disabled="props.disabled"
              @change="e => onDirectorySelection(e.target.files)"
            />
            <va-button
              :disabled="props.disabled"
              @click="() => { folderUploadInput.click(); }"
            >
              {{ isDragging ? 'Drop Directory Here' : 'Select Directory' }}
            </va-button>
          </div>
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

const isDragging = ref(false);
const folderUploadInput = ref(null);

const isWindows = (path) => path.includes('\\');
const isUnix = (path) => path.includes('/') && !path.includes('\\');

/**
 * Extracts the directory path from a file's customRelativePath or webkitRelativePath
 * @param {File} file - The file object
 * @returns {string} The directory path of the file
 *
 * @description
 * - customRelativePath: Used when files are selected via drag-and-drop.
 *   This property is manually set in the readDirectory function for each file.
 * - webkitRelativePath: Used when files are selected using the browser's file selection dialog box
 *   (webkitdirectory attribute).
 *   This property is automatically set by the browser for files selected this way.
 * - If neither property is available, an empty string is used as a fallback.
 */
const getFilePath = (file) => {
  const path = file.customRelativePath || file.webkitRelativePath || "";
  return isUnix(path)
    ? path.slice(0, path.lastIndexOf("/"))
    : path.slice(0, path.lastIndexOf("\\")).replace(/\\/g, "/");
};

/**
 * Recursively retrieves all files from the given items (files or directories)
 * @param {FileList|DataTransferItemList} items - The items to process
 * @returns {Promise<File[]>} A promise that resolves to an array of File objects
 */
const getAllFilesFromItems = async (items) => {
  const files = [];
  const queue = Array.from(items);

  while (queue.length > 0) {
    const item = queue.shift();
    // todo - comment if / else scenarios
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        if (entry.isFile) {
          const file = await getFileFromEntry(entry);
          files.push(file);
        } else if (entry.isDirectory) {
          const directoryFiles = await readDirectory(entry);
          files.push(...directoryFiles);
        }
      }
    } else if (item instanceof File) {
      item.path = item.webkitRelativePath || item.name;
      files.push(item);
    }
  }

  return files;
};

/**
 * Converts a FileSystemFileEntry to a File object
 * @param {FileSystemFileEntry} entry - The file entry to convert
 * @returns {Promise<File>} A promise that resolves to a File object
 */
const getFileFromEntry = async (entry) => {
  return new Promise((resolve) => {
    entry.file(file => {
      file.path = entry.fullPath.slice(1); // Remove leading slash
      resolve(file);
    });
  });
};

/**
 * Recursively reads a directory and returns all files within it
 * @param {FileSystemDirectoryEntry} dirEntry - The directory entry to read
 * @returns {Promise<File[]>} A promise that resolves to an array of File objects
 */
const readDirectory = async (dirEntry, path = '') => {
  const files = [];
  const dirReader = dirEntry.createReader();
  let entries = await readEntries(dirReader);

  while (entries.length > 0) {
    for (let entry of entries) {
      if (entry.isFile) {
        const file = await getFileFromEntry(entry);
        file.path = path + '/' + entry.name;
        files.push(file);
      } else if (entry.isDirectory) {
        files.push(...await readDirectory(entry, path + '/' + entry.name));
      }
    }
    entries = await readEntries(dirReader);
  }

  return files;
};

/**
 * Reads entries from a directory reader
 * @param {FileSystemDirectoryReader} dirReader - The directory reader
 * @returns {Promise<FileSystemEntry[]>} A promise that resolves to an array of directory entries
 */
const readEntries = (dirReader) => {
  return new Promise((resolve) => {
    dirReader.readEntries(resolve);
  });
};

const onDragOver = (event) => {
  isDragging.value = true;
  event.dataTransfer.dropEffect = 'copy';
};

const onDragLeave = () => {
  isDragging.value = false;
};

const onDrop = async (event) => {
  isDragging.value = false;
  event.preventDefault();
  const items = event.dataTransfer.items;
  if (items) {
    await onDirectorySelection(items);
  }
};

/**
 * Processes selected directory items and emits the directory-added event
 * @param {FileList|DataTransferItemList} items - The selected items
 */
const onDirectorySelection = async (items) => {
  const files = await getAllFilesFromItems(items);
  if (files.length === 0) {
    return;
  }

  const filePath = files[0]?.path || "";
  const directoryName = isWindows(filePath)
    ? filePath.slice(0, filePath.indexOf("\\"))
    : filePath.slice(0, filePath.indexOf("/"));

  emit("directory-added", {
    directoryName: directoryName,
    files: files.map((file) => {
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
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.va-file-upload {
  height: 100%;
}

.va-file-upload__field {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-container {
  height: 100%;
}

.flex {
  gap: 1px;
}

@media (max-width: 639px) {
  .va-file-upload,
  .folder-upload--container {
    height: 100px;
  }

  .flex {
    gap: 1px;
  }
}

@media (min-width: 640px) {
  .flex {
    gap: 1px;
  }
}
</style>
