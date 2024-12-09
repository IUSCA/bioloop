<template>
  <va-scroll-container class="max-h-52" vertical>
    <va-data-table :columns="columns" :items="items">
      <template #cell(name)="{ value }">
        <div class="flex items-center gap-1">
          <FileTypeIcon :filename="value" />
          <span>{{ value }}</span>
        </div>
      </template>

      <template #cell(original_md5)="{ value }">
        <span class="text-sm">{{ value }}</span>
      </template>

      <template #cell(duplicate_md5)="{ value }">
        <span class="text-sm">{{ value }}</span>
      </template>
    </va-data-table>
  </va-scroll-container>
</template>

<script setup>
import _ from "lodash";

const props = defineProps({
  conflictingFiles: {
    type: Array,
    default: () => [],
  },
  originalDatasetFiles: {
    type: Array,
    default: () => [],
  },
  duplicateDatasetFiles: {
    type: Array,
    default: () => [],
  },
});

const items = computed(() => {
  const conflictingFiles = _.groupBy(props.conflictingFiles, (e) => e.path);
  console.log("conflictingFiles");
  console.log(conflictingFiles);
  const conflictingFilesPaths = Object.keys(conflictingFiles);
  // const conflictingFilesMap = new Map(conflictingFiles.map((files) =>
  // [files[0].path, files]));
  console.log("conflictingFilesPaths");
  console.log(conflictingFilesPaths);
  const originalFilesMap = new Map(
    props.originalDatasetFiles.map((file) => [file.path, file]),
  );
  // debugger
  const duplicateFilesMap = new Map(
    props.duplicateDatasetFiles.map((file) => [file.path, file]),
  );
  return conflictingFilesPaths.map((path) => {
    const originalFile = originalFilesMap.get(path);
    const duplicateFile = duplicateFilesMap.get(path);
    return {
      name: originalFile.name,
      path: originalFile.path,
      original_md5: originalFile.md5,
      duplicate_md5: duplicateFile.md5,
    };
  });
});

const columns = [
  {
    key: "name",
    label: "File",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "path",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "original_md5",
    label: "Original Checksum",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "duplicate_md5",
    label: "Incoming File Checksum",
    thAlign: "right",
    tdAlign: "right",
  },
];
</script>
