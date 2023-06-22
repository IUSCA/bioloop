<template>
  <div class="flex justify-center">
    <div class="w-3/4 flex-none">
      <!-- BreadCrumbs Navigation -->
      <!-- border border-solid border-slate-400 -->
      <div class="pl-1">
        <va-breadcrumbs>
          <va-breadcrumbs-item
            class="text-2xl cursor-pointer hover:bg-slate-300 rounded-full p-2"
            @click="pwd = ''"
          >
            <i-mdi-home class="" />
          </va-breadcrumbs-item>
          <va-breadcrumbs-item
            class="text-2xl cursor-pointer"
            v-if="path_items.length > 3"
          >
            ...
          </va-breadcrumbs-item>
          <!-- lg:hover:bg-slate-200 lg:rounded-full lg:px-2 lg:pb-2 lg:pt-1 -->
          <va-breadcrumbs-item
            :label="path_item.name"
            v-for="(path_item, idx) in path_items.slice(-3)"
            :key="idx"
            class="text-2xl cursor-pointer"
            @click="pwd = path_item.rel_path"
          />
        </va-breadcrumbs>
      </div>

      <!-- File Table -->
      <div class="mt-3">
        <va-data-table
          :items="filelist"
          :columns="columns"
          v-model:sort-by="sortBy"
          v-model:sorting-order="sortingOrder"
          :loading="data_loading"
          hoverable
          clickable
          @row:click="onClick"
          virtual-scroller
          sticky-header
          style="height: calc(100vh - 11rem)"
          class="p-1"
        >
          <template #cell(size)="{ source }">
            <span>{{ source != null ? formatBytes(source) : "" }}</span>
          </template>

          <template #cell(name)="{ rowData }">
            <div class="flex items-center gap-1">
              <Icon
                v-if="rowData.isDir"
                icon="mdi-folder"
                class="text-2xl flex-none text-gray-700"
              />

              <FileTypeIcon v-else :filename="rowData.name" />
              <span> {{ rowData.name }} </span>
            </div>
          </template>

          <template #cell(lastModified)="{ source }">
            <span>{{ moment(source).utc().format("MMM DD, YYYY") }}</span>
          </template>
        </va-data-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import moment from "moment";
import dirListService from "@/services/dir_list";
import { formatBytes } from "@/services/utils";

// const props = defineProps({ id: String });

const route = useRoute();
// const router = useRouter();

console.log({
  app_id: route.query.app_id,
  path: route.query.path,
});

const filelist = ref([]);
const pwd = ref("");
const columns = [
  { key: "name", sortable: true },
  { key: "lastModified", label: "Last Modified", sortable: true },
  { key: "size", sortable: true },
];

// initial sorting order
const sortBy = ref("name");
const sortingOrder = ref("asc");

const data_loading = ref(false);

const path_items = computed(() => {
  if (pwd.value === "") {
    return [];
  }
  const parts = pwd.value.split("/");
  const result = parts.map((t, i) => ({
    name: t,
    rel_path: parts.slice(0, i + 1).join("/"),
  }));
  console.log({
    pwd: pwd.value,
    parts,
    result,
  });
  return result;
});

function get_filelist(path) {
  data_loading.value = true;
  dirListService
    .getListing(path)
    .then((res) => {
      filelist.value = res.data;
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
  console.log("click", row.name, row.isDir, row.path);

  if (row.isDir) {
    pwd.value = row.path;
  }
}
</script>

<route lang="yaml">
meta:
  title: Dashboard
</route>
