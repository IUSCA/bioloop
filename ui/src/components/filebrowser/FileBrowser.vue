<template>
  <div class="flex justify-center">
    <div class="w-full flex-none">
      <va-inner-loading :loading="data_loading">
        <!-- BreadCrumbs Navigation / Search Filters -->
        <!-- Make height of the div fixed to prevent content jumping when v-if cond. changes -->
        <div class="h-[40px] flex items-center">
          <!--
          The current dataset is an active dataset which has incoming duplicates,
          or one that is currently being overwritten by a duplicate.
          -->
          <DatasetOverwriteStateAlert :dataset="dataset" />

          <!-- The current dataset is being overwritten by another dataset -->
          <DatasetOverwriteInProgressStateAlert :dataset="dataset" />

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
        />
      </va-inner-loading>
    </div>
  </div>

  <FileBrowserSearchModal ref="advancedSearchModal" @search="search_files" />
</template>

<script setup>
import datasetService from "@/services/dataset";
import { useFileBrowserStore } from "@/stores/fileBrowser";
import { storeToRefs } from "pinia";
import { filterByValues } from "@/services/utils";
import DatasetOverwriteStateAlert from "@/components/dataset/DatasetOverwriteStateAlert.vue";

const store = useFileBrowserStore();
const { pwd, filters, isInSearchMode, filterStatus } = storeToRefs(store);

const props = defineProps({
  datasetId: String,
  showDownload: Boolean,
});

const dataset = ref(null);
const data_loading = ref(false);
const fileList = ref([]);
const searchResults = ref([]);
const files = computed(() => {
  return isInSearchMode.value ? searchResults.value : fileList.value;
});

function get_file_list(path) {
  data_loading.value = true;
  Promise.all([
    datasetService.getById({
      id: props.datasetId,
      include_duplications: true,
      include_states: true,
      include_action_items: true,
    }),
    datasetService.list_files({ id: props.datasetId, basepath: path }),
  ])
    .then((responses) => {
      dataset.value = responses[0].data;
      fileList.value = responses[1].data;
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

function search_files() {
  data_loading.value = true;
  const p = payload();
  // console.log("payload", p);
  datasetService
    .search_files({
      id: props.datasetId,
      ...p,
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
    store.resetFilters();
    isInSearchMode.value = false;
    get_file_list(pwd.value);
  },
  { immediate: true },
);

const nameRef = toRefs(store.filters).name;
const debouncedNameFilter = refDebounced(nameRef, 215);

watch(
  [debouncedNameFilter],
  () => {
    if (isInSearchMode.value) {
      search_files();
    }
  },
  { immediate: true },
);

const advancedSearchModal = ref(null);

function openModal() {
  advancedSearchModal.value.show();
}

onUnmounted(() => {
  store.reset();
});
</script>
