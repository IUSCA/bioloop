<template>
  <va-alert v-if="props.conflictingFiles.length === 0" color="success">
    All files in the original dataset match checksums of corresponding files in
    the incoming duplicate
  </va-alert>

  <div v-else>
    <va-alert class="mb-4" color="warning">
      The following files in the original dataset did not match checksums of
      corresponding files in the incoming duplicate
    </va-alert>

    <va-scroll-container class="max-h-52" vertical>
      <va-data-table :columns="columns" :items="props.conflictingFiles">
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
  </div>
</template>

<script setup>
const props = defineProps({
  conflictingFiles: {
    type: Array,
    default: () => [],
  },
});

const columns = [
  {
    key: "name",
    label: "File",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    // width: "90px",
    // tdStyle: "word-wrap: break-word; overflow-wrap: anywhere;",
    // tdClass: "break-words",
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

<style scoped></style>
