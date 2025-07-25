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
const files = computed(() => {
  return isInSearchMode.value ? searchResults.value : fileList.value;
});

function get_file_list(path) {
  data_loading.value = true;
  datasetService
    .list_files({ id: props.datasetId, basepath: path })
    .then((res) => {
      fileList.value = res.data;
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      data_loading.value = false;
    });
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
  data_loading.value = true;
  const p = payload();
  // console.log("payload", p);
  datasetService
    .search_files({
      id: props.datasetId,
      ...p,
      sortBy,
      sortOrder: sortingOrder,
    })
    .then((res) => {
      searchResults.value = res.data;
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      data_loading.value = false;
    });
}

onMounted(() => {
  get_file_list(pwd.value);
});

watch(pwd, (newValue, oldValue) => {
  if (oldValue == null) return;
  // navigating to a directory disables the search mode
  store.resetFilters();
  isInSearchMode.value = false;
  get_file_list(pwd.value);
});

watch(
  filters,
  () => {
    // console.log("filters changed", filters.value, isInSearchMode.value);
    if (isInSearchMode.value) {
      search_files();
    }
  },
  { immediate: true, deep: true },
);

const advancedSearchModal = ref(null);

function openModal() {
  advancedSearchModal.value.show();
}

onUnmounted(() => {
  store.reset();
});
</script>
