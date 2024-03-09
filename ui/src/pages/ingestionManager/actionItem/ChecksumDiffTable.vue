<template>
  <va-data-table :columns="columns" :items="props.items">
    <template #cell(name)="{ value }">
      <div class="flex items-center gap-1">
        <FileTypeIcon :filename="value" />
        <span>{{ value }}</span>
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
    key: "name",
    label: "File",
    // width: "90px",
    // tdStyle: "word-wrap: break-word; overflow-wrap: anywhere;",
    // tdClass: "break-words",
  },
  {
    key: "path",
    thAlign: "center",
    tdAlign: "center",
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
    thAlign: "right",
    tdAlign: "right",
  },
];
</script>

<style scoped></style>
