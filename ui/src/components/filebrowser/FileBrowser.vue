<template>
  <div class="flex justify-center">
    <div class="w-full flex-none">
      <!-- BreadCrumbs Navigation -->
      <!-- border border-solid border-slate-400 -->
      <div class="">
        <va-breadcrumbs>
          <va-breadcrumbs-item
            class="text-xl cursor-pointer hover:bg-slate-300 rounded-full p-2"
            @click="pwd = ''"
          >
            <i-mdi-folder-home class="hover:text-blue-600" />
          </va-breadcrumbs-item>
          <va-breadcrumbs-item
            class="text-xl cursor-pointer"
            v-if="path_items.length > 3"
          >
            ...
          </va-breadcrumbs-item>
          <!-- lg:hover:bg-slate-200 lg:rounded-full lg:px-2 lg:pb-2 lg:pt-1 -->
          <va-breadcrumbs-item
            :label="path_item.name"
            v-for="(path_item, idx) in path_items.slice(-3)"
            :key="idx"
            class="text-xl cursor-pointer"
            @click="pwd = path_item.rel_path"
          />
        </va-breadcrumbs>
      </div>

      <!-- filter input and number of results -->
      <div class="grid grid-cols-12 gap-3 mt-2">
        <!-- search bar -->
        <div class="col-span-11">
          <va-input
            v-model="filterInput"
            class="w-full"
            placeholder="Search current directory"
            outline
            clearable
          />
        </div>

        <!-- filter -->
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
          :filter="filterInput"
          hoverable
          clickable
          @row:click="onClick"
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
            <div class="flex items-center gap-1">
              <Icon
                v-if="rowData.filetype === 'directory'"
                icon="mdi-folder"
                class="text-2xl flex-none text-gray-700"
              />

              <FileTypeIcon v-else :filename="rowData.name" />
              <span> {{ rowData.name }} </span>
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
import {
  formatBytes,
  cmp,
  maybePluralize,
  caseInsensitiveIncludes,
} from "@/services/utils";

const props = defineProps({ datasetId: String });

const filelist = ref([]);
const pwd = ref("");
const filterInput = ref("");
const columns = [
  { key: "name", sortable: true },
  // { key: "lastModified", label: "Last Modified", sortable: true },
  { key: "size", sortable: true, sortingFn: cmp, width: "100px" },
  { key: "filetype", label: "type", sortable: true, width: "100px" },
  { key: "md5", width: "250px", label: "MD5 Checksum" },
];

// initial sorting order
const sortBy = ref("size");
const sortingOrder = ref("asc");

const data_loading = ref(false);

const path_items = computed(() => {
  /**
   * if pwd is 'dir1/dir2/dir3/file.txt'
   * then path_items is
   * [{
   *    name: 'dir1',
   *    rel_path: 'dir1'
   * }, {
   *    name: 'dir2',
   *    rel_path: 'dir1/dir2'
   * }, {
   *    name: 'dir3',
   *    rel_path: 'dir1/dir2/dir3'
   * }]
   */

  if (pwd.value === "") {
    return [];
  }
  const parts = pwd.value.split("/");
  const result = parts.map((t, i) => ({
    name: t,
    rel_path: parts.slice(0, i + 1).join("/"),
  }));
  return result;
});

const rows = computed(() => {
  return filelist.value.filter((file) =>
    caseInsensitiveIncludes(file?.name, filterInput.value)
  );
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
          filetype: obj.filetype || `.${extension(name)}`,
        };
      });
    })
    .catch((err) => {
      console.log(err);
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
</script>
