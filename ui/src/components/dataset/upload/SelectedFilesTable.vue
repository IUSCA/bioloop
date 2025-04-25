<template>
  <va-data-table
    v-if="!noFilesSelected"
    class="upload-file-table"
    :items="props.files"
    :columns="columns"
    virtual-scroller
  >
    <template #cell(name)="{ rowData }">
      <div class="flex items-center gap-1 text-left">
        <Icon
          v-if="rowData.type === 'directory'"
          icon="mdi-folder"
          class="text-xl flex-none text-gray-700"
        />
        <FileTypeIcon v-else :filename="rowData.name" />
        <span> {{ rowData.name }} </span>
      </div>
    </template>

    <template #cell(actions)="{ rowIndex }">
      <div class="flex justify-end">
        <va-button
          preset="plain"
          icon="delete"
          color="danger"
          @click="removeFile(rowIndex)"
          :disabled="(props.files || []).length < 1"
        />
      </div>
    </template>
  </va-data-table>

  <!--  <div v-for="file in props.files">-->
  <!--    {{ file.name }}-->
  <!--  </div>-->
</template>

<script setup>
const props = defineProps({
  files: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["file-removed"]);

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
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "actions",
    width: "20%",
    thAlign: "right",
    tdAlign: "right",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const removeFile = (fileIndex) => {
  emit("file-removed", fileIndex);
};
</script>

<style scoped>
.upload-file-table {
  height: 300px;
  max-height: 300px;
}
</style>
