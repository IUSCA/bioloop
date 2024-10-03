<template>
  <va-data-table
    :items="rows"
    :columns="columns"
    v-model:sort-by="sortBy"
    v-model:sorting-order="sortingOrder"
    :loading="data_loading"
    hoverable
    :row-bind="getRowBind"
    @row:click="onClick"
    virtual-scroller
    sticky-header
    style="height: calc(100vh - 13.75rem)"
    class="filetable"
  >
    <template #cell(size)="{ rowData }">
      <span v-if="rowData.filetype !== 'directory'">
        {{ formatBytes(rowData.size) }}
      </span>
    </template>

    <template #cell(typeSortableName)="{ rowData }">
      <!-- directory -->
      <div
        class="flex items-center gap-1"
        v-if="rowData.filetype === 'directory'"
      >
        <Icon icon="mdi-folder" class="text-xl flex-none text-gray-700" />
        <span> {{ rowData.name }} </span>
      </div>

      <!-- file -->
      <button
        class="flex items-center gap-1 text-left"
        :class="{ 'cursor-pointer': showDownload }"
        v-else
        @click="showDownload ? initiate_file_download(rowData) : () => {}"
      >
        <FileTypeIcon :filename="rowData.name" />

        <span> {{ rowData.name }} </span>
      </button>
    </template>

    <template #cell(download)="{ rowData }">
      <!-- donwload button -->
      <va-button
        class="flex-none"
        preset="plain"
        color="primary"
        icon="download"
        v-if="showDownload && rowData.filetype !== 'directory'"
        @click="showDownload ? initiate_file_download(rowData) : () => {}"
      >
      </va-button>
    </template>

    <!-- <template #cell(lastModified)="{ source }">
            <span>{{ datetime.date(source) }}</span>
          </template> -->

    <template #cell(md5)="{ source }">
      <span class="text-sm"> {{ source }} </span>
    </template>

    <template #cell(filetype)="{ source }">
      <span>
        {{ source.startsWith(".") ? source.slice(1) : source }}
      </span>
    </template>

    <template #cell(path)="{ rowData }">
      <FileBrowserShortPath
        :data="rowData"
        @click="
          (path) => {
            store.pwd = path;
          }
        "
      />
    </template>
  </va-data-table>
</template>

<script setup>
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import { cmp, downloadFile, formatBytes } from "@/services/utils";
import { useFileBrowserStore } from "@/stores/fileBrowser";

const store = useFileBrowserStore();

const props = defineProps({
  datasetId: {
    type: String,
  },
  files: {
    type: Array,
    default: () => [],
  },
  showDownload: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["download-initiated"]);

const columns = computed(() => {
  if (store.isInSearchMode) {
    return [
      {
        key: "typeSortableName",
        label: "name",
        tdStyle:
          "min-width: 300px; white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
      },
      { key: "download", label: "DL", width: "30px", tdAlign: "left" },
      {
        key: "path",
        label: "Location",
        width: "300px",
        tdStyle:
          "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
        tdAlign: "center",
      },
      { key: "size", width: "100px" },
      { key: "md5", width: "250px", label: "MD5 Checksum" },
    ];
  } else {
    return [
      {
        key: "typeSortableName",
        label: "name",
        sortable: true,
        sortingFn: nameSortingFn,
        tdStyle:
          "min-width: 300px; white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
      },
      { key: "download", label: "DL", width: "30px", tdAlign: "left" },
      // { key: "lastModified", label: "Last Modified", sortable: true },
      {
        key: "size",
        sortable: true,
        sortingFn: (a, b) => a - b,
        width: "100px",
      },
      { key: "filetype", label: "type", sortable: true, width: "100px" },
      { key: "md5", width: "250px", label: "MD5 Checksum" },
    ];
  }
});

// initial sorting order
const sortBy = ref("typeSortableName");
const sortingOrder = ref("asc");
const data_loading = ref(false);

function extension(name) {
  const parts = name.split(".");
  if (parts.length > 1) return parts.slice(-1)[0];
  else return "";
}

const rows = computed(() => {
  return props.files.map((obj) => {
    return {
      ...obj,
      filetype:
        obj.filetype === "directory" ? obj.filetype : `.${extension(obj.name)}`,
      typeSortableName: { name: obj.name, filetype: obj.filetype },
    };
  });
});

function onClick(event) {
  const row = event.item;

  if (row.filetype === "directory") {
    store.pwd = row.path;
  }
}

function initiate_file_download(row) {
  // to download a file
  // get file url and token from the API to create a download url
  // and trigger file download through browser

  data_loading.value = true;
  datasetService
    .get_file_download_data({
      dataset_id: props.datasetId,
      file_id: row.id,
    })
    .then((res) => {
      const url = new URL(res.data.url);
      url.searchParams.set("token", res.data.bearer_token);
      downloadFile({
        url: url.toString(),
        filename: row.name,
      });
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to download file");
    })
    .finally(() => {
      data_loading.value = false;
      emit("download-initiated");
    });
}

function getRowBind(row) {
  if (row.filetype === "directory") {
    return { class: ["cursor-pointer"] };
  }
}

function nameSortingFn(a, b) {
  // compare filetypes and then compare names
  // in ascending order directories appear first, i.e. cmp(dir, file) < 0
  if (a.filetype === b.filetype) {
    return cmp(a.name, b.name);
  } else if (a.filetype === "directory") {
    return -1;
  } else {
    return 1;
  }
}
</script>

<style scoped>
.filetable {
  --va-data-table-cell-padding: 8px;
}
</style>
