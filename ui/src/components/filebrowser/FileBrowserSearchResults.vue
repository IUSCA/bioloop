<template>
  <va-data-table
    :items="results"
    :columns="columns"
    :loading="data_loading"
    hoverable
    :row-bind="getRowBind"
    virtual-scroller
    sticky-header
    style="height: calc(100vh - 11rem)"
    class="py-1"
  >
    <template #cell(size)="{ rowData }">
      <span v-if="rowData.filetype !== 'directory'">
        {{ rowData.size != null ? formatBytes(rowData.size) : "" }}
      </span>
    </template>

    <template #cell(name)="{ rowData }">
      <!-- directory -->
      <div
        class="flex items-center gap-1"
        v-if="rowData.filetype === 'directory'"
      >
        <Icon icon="mdi-folder" class="text-2xl flex-none text-gray-700" />
        <span> {{ rowData.name }} </span>
      </div>

      <!-- file -->
      <div
        class="flex items-center gap-1"
        :class="{ 'cursor-pointer': showDownload }"
        v-else
        @click="showDownload ? initiate_file_download(rowData) : () => {}"
      >
        <FileTypeIcon :filename="rowData.name" />

        <span> {{ rowData.name }} </span>

        <!-- donwload button -->
        <va-button
          class="flex-none"
          preset="plain"
          color="primary"
          icon="download"
          v-if="showDownload"
        >
        </va-button>
      </div>
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
  </va-data-table>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";

const props = defineProps({
  datasetId: {
    type: String,
  },
  query: {
    type: String,
  },
  basepath: {
    type: String,
    default: "",
  },
});

const results = ref([]);
const columns = [
  { key: "name" },
  { key: "path" },
  { key: "size" },
  { key: "md5" },
  { key: "filetype" },
];
const data_loading = ref(false);

watch(
  () => props.query,
  () => {
    if (props.query && props.query.length >= 3) {
      datasetService
        .search_files({
          id: props.datasetId,
          query: props.query,
          basepath: props.basepath,
        })
        .then((res) => {
          results.value = res.data;
        });
    }
  }
);

function getRowBind(row) {
  if (row.filetype === "directory") {
    return { class: ["cursor-pointer"] };
  }
}
</script>
