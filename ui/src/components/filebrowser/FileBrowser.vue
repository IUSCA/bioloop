<template>
  <div class="flex justify-center">
    <div class="w-full flex-none">
      <va-inner-loading :loading="data_loading">
        <!-- BreadCrumbs Navigation / Search Filters -->
        <!-- Make height of the div fixed to prevent content jumping when v-if cond. changes -->
        <div class="h-[40px] flex items-center">
          <FileBrowserSearchFilters
            v-if="store.isInSearchMode"
            class="flex-none"
          />

          <FileBrowserNav v-else v-model:pwd="pwd" />
        </div>

        <!-- filters -->
        <FileBrowserSearchBar class="mt-2" />

        <!-- File Table -->
        <FileTable :show-download="props.showDownload" :files="files" />
      </va-inner-loading>
    </div>
  </div>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { useFileBrowserStore } from "@/stores/fileBrowser";
import { storeToRefs } from "pinia";

const store = useFileBrowserStore();

const props = defineProps({
  datasetId: String,
  showDownload: Boolean,
});

const { pwd, nameFilter, locationFilter } = storeToRefs(store);

const data_loading = ref(false);
const fileList = ref([]);
const searchResults = ref([]);
const files = computed(() => {
  return store.isInSearchMode ? searchResults.value : fileList.value;
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

function search_files() {
  data_loading.value = true;
  datasetService
    .search_files({
      id: props.datasetId,
      query: debouncedNameFilter.value,
      basepath: locationFilter.value,
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

watch(
  pwd,
  () => {
    // navigating to a directory disables the search mode
    get_file_list(pwd.value);
    store.clearSearchFilters();
  },
  { immediate: true }
);

const debouncedNameFilter = refDebounced(nameFilter, 200);

watch([debouncedNameFilter], () => {
  if (debouncedNameFilter.value || locationFilter.value) {
    search_files();
    store.isInSearchMode = true;
  } else {
    // empty filters - disable the search mode
    store.isInSearchMode = false;
  }
});
</script>
