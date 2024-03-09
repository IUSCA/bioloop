<template>
  <va-data-table :columns="columns" :items="props.items">
    <template #cell(path)="{ rowData }">
      <div class="flex items-center gap-1">
        <FileTypeIcon :filename="rowData.name" />
        <span>{{ rowData.path }}</span>
      </div>
    </template>
  </va-data-table>
</template>

<script setup>
const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
});

const columns = [
  {
    key: "path",
    label: "File",
    tdStyle: "word-wrap: break-word; overflow-wrap: anywhere;",
  },
  {
    key: "original_md5",
    label: "Original File Checksum",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "duplicate_md5",
    label: "Incoming Duplicate Checksum",
    thAlign: "center",
    tdAlign: "center",
  },
];
</script>

<style scoped></style>
