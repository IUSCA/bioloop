<template>
  <div class="flex justify-center">
    <div class="w-full flex-none">
      <va-inner-loading :loading="data_loading">
        <!-- BreadCrumbs Navigation / Search Filters -->
        <!-- Make height of the div fixed to prevent content jumping when v-if cond. changes -->
        <div class="h-[40px] flex items-center">
          <FileBrowserSearchFilters
            v-if="isInSearchMode"
            class="flex-none"
            @search="search_files"
            @advanced-search="openModal"
          />

          <FileBrowserNav v-else v-model:pwd="pwd" />
        </div>

        <!-- filters -->
        <div class="mt-2">
          <FileBrowserSearchBar @advanced-search="openModal" />
          <!-- {{ filterStatus }} -->
        </div>

        <!-- File Table -->
        <FileTable
          :show-download="props.showDownload"
          :files="files"
          :dataset-id="props.datasetId"
          @search="search_files"
        />
      </va-inner-loading>
    </div>
  </div>

  <FileBrowserSearchModal ref="advancedSearchModal" />
</template>

<script setup>
import datasetService from "@/services/dataset";
import { filterByValues } from "@/services/utils";
import { useFileBrowserStore } from "@/stores/fileBrowser";
import { storeToRefs } from "pinia";

const store = useFileBrowserStore();
const { pwd, filters, isInSearchMode, filterStatus } = storeToRefs(store);

const props = defineProps({
  datasetId: String,
  showDownload: Boolean,
});

const data_loading = ref(false);
const fileList = ref([]);
const searchResults = ref([]);
let latestRequestId = 0;

const files = computed(() => {
  return isInSearchMode.value ? searchResults.value : fileList.value;
});

async function loadFiles(request, results) {
  const requestId = ++latestRequestId;
  data_loading.value = true;
  try {
    const { data } = await request();
    if (requestId === latestRequestId) results.value = data;
  } catch (error) {
    if (requestId === latestRequestId) console.error(error);
  } finally {
    if (requestId === latestRequestId) data_loading.value = false;
  }
}

function get_file_list(path) {
  loadFiles(
    () => datasetService.list_files({ id: props.datasetId, basepath: path }),
    fileList,
  );
}

function payload() {
  // only consider enabled filters
  const p = filterByValues(filters.value, (key, _) => filterStatus.value[key]);

  // set pwd
  if (p.location === "pwd") {
    p.location = store.pwd;
  }
  return p;
}

function search_files({ sortBy = null, sortingOrder = null } = {}) {
  loadFiles(
    () =>
      datasetService.search_files({
        id: props.datasetId,
        ...payload(),
        sortBy,
        sortOrder: sortingOrder,
      }),
    searchResults,
  );
}

watch(pwd, (_, oldValue) => {
  if (oldValue == null) return;
  // navigating to a directory disables the search mode
  store.resetFilters();
  isInSearchMode.value = false;
});

watch(
  [pwd, isInSearchMode, filters],
  ([path, searching], [previousPath, wasSearching]) => {
    if (searching) {
      search_files();
    } else if (path !== previousPath || searching !== wasSearching) {
      get_file_list(path);
    }
  },
  { immediate: true, deep: true },
);

const advancedSearchModal = ref(null);

function openModal() {
  advancedSearchModal.value.show();
}

onUnmounted(() => {
  latestRequestId += 1;
  store.reset();
});
</script>
