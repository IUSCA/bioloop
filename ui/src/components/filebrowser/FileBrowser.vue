<template>
  <div class="flex justify-center">
    <div class="w-full flex-none">
      <!-- BreadCrumbs Navigation -->
      <!-- border border-solid border-slate-400 -->
      <div class="">
        <FileBrowserNav v-model:pwd="pwd" />
      </div>

      <!-- filter input and number of results -->
      <div class="grid grid-cols-12 gap-3 mt-2">
        <!-- search bar -->
        <div class="col-span-11">
          <va-input
            v-model="searchInput"
            class="w-full"
            placeholder="Search everywhere"
            outline
            clearable
          >
            <template #prependInner>
              <Icon icon="material-symbols:search" class="text-xl" />
            </template>
            <template #appendInner>
              <va-button preset="secondary" round>
                <Icon icon="mdi:tune" class="text-xl" />
              </va-button>
            </template>
          </va-input>
        </div>

        <!-- number of results -->
        <div class="col-span-1 flex items-center">
          <div class="text-right">
            {{ maybePluralize(rows.length, "item") }}
          </div>
        </div>
      </div>

      <!-- File Table -->
      <div class="">
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
          style="height: calc(100vh - 11rem)"
          class="py-1 filetable"
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
              <Icon icon="mdi-folder" class="text-xl flex-none text-gray-700" />
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
      </div>
    </div>
  </div>
</template>

<script setup>
// import * as datetime from "@/services/datetime";
import datasetService from "@/services/dataset";
import { formatBytes, maybePluralize, downloadFile } from "@/services/utils";
import { useToastStore } from "@/stores/toast";
const toast = useToastStore();

const props = defineProps({
  datasetId: String,
  showDownload: {
    type: Boolean,
    default: false,
  },
});

const filelist = ref([]);
const pwd = ref("");
const searchInput = ref("");
const columns = [
  { key: "name", sortable: true },
  // { key: "lastModified", label: "Last Modified", sortable: true },
  { key: "size", sortable: true, sortingFn: (a, b) => a - b, width: "100px" },
  { key: "filetype", label: "type", sortable: true, width: "100px" },
  { key: "md5", width: "250px", label: "MD5 Checksum" },
];

// initial sorting order
const sortBy = ref("name");
const sortingOrder = ref("asc");

const data_loading = ref(false);

const rows = computed(() => {
  return filelist.value;
});

function filename(path) {
  return path.split("/").slice(-1)[0];
}

function extension(name) {
  return name.split(".").slice(-1)[0];
}

function get_filelist(path) {
  data_loading.value = true;
  datasetService
    .list_files({ id: props.datasetId, basepath: path })
    .then((res) => {
      filelist.value = res.data.map((obj) => {
        const name = filename(obj.path);
        return {
          ...obj,
          name,
          filetype:
            obj.filetype === "directory" ? obj.filetype : `.${extension(name)}`,
        };
      });
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      data_loading.value = false;
    });
}

watch(
  pwd,
  () => {
    get_filelist(pwd.value);
  },
  { immediate: true }
);

function onClick(event) {
  const row = event.item;

  if (row.filetype === "directory") {
    pwd.value = row.path;
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
    });
}

function getRowBind(row) {
  if (row.filetype === "directory") {
    return { class: ["cursor-pointer"] };
  }
}
</script>

<style scoped>
.filetable {
  --va-data-table-cell-padding: 8px;
}
</style>
