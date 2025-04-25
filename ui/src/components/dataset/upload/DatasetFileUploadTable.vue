<template>
  <!-- File being/to be uploaded -->
  <va-data-table
    class="upload-file-table"
    v-if="!noFilesSelected"
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
          v-if="value === constants.UPLOAD_STATUSES.UPLOADED"
          message="Succeeded"
        >
          <va-icon name="check_circle_outline" color="success" />
        </va-popover>
        <va-popover
          v-if="value === constants.UPLOAD_STATUSES.UPLOADING"
          message="Uploading"
        >
          <va-icon name="pending" color="info" />
        </va-popover>
        <va-popover
          v-if="value === constants.UPLOAD_STATUSES.UPLOAD_FAILED"
          message="Failed"
        >
          <va-icon name="error_outline" color="danger" />
        </va-popover>
      </span>
    </template>
  </va-data-table>
</template>

<script setup>
import config from "@/config";
import constants from "@/constants";

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
    width: "33%",
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
    width: "15%",
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
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "progress",
    width: "17%",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];
</script>

<style scoped>
.upload-file-table {
  height: 300px;
  max-height: 300px;
}
</style>
