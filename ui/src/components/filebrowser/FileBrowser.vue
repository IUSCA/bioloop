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
          :show-download="showDownload"
          :files="files"
          :dataset-id="props.datasetId"
        />
      </va-inner-loading>
    </div>
  </div>

  <FileBrowserSearchModal ref="advancedSearchModal" @search="search_files" />
</template>

<script setup>
import projectService from "@/services/projects";
import datasetService from "@/services/dataset";
import { useFileBrowserStore } from "@/stores/fileBrowser";
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";
import { storeToRefs } from "pinia";
import { filterByValues } from "@/services/utils";
import { useToastStore } from "@/stores/toast";
import { useAuthStore } from "@/stores/auth";
import { useDatasetStore } from "@/stores/dataset";
import { useProjectStore } from "@/stores/projects/project";
import config from "@/config";

const store = useFileBrowserStore();
const route = useRoute();
const toast = useToastStore();
const auth = useAuthStore();
const breadcrumbsStore = useBreadcrumbsStore();
const datasetStore = useDatasetStore();
const projectStore = useProjectStore();

const { pwd, filters, isInSearchMode, filterStatus } = storeToRefs(store);

const props = defineProps({
  datasetId: String,
});

const dataset = computed(() => datasetStore.dataset);
const showDownload = computed(
  () => config.file_browser.enable_downloads && dataset.value.is_staged
);

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

//
function fetchDatasetAndProject(route) {
  if (route.params.datasetId) {
    datasetService
      .getById({ id: route.params.datasetId, workflows: false })
      .then((res) => {
        const dataset = res.data;
        // setup dataset details in store, in case other components need it
        datasetStore.setDataset(dataset);
        // setup dataset breadcrumbs
        breadcrumbsStore.addNavItem(
          {
            label: dataset.name,
            // to: "test",
            to: `${route.path.slice(0, route.path.indexOf("filebrowser"))}${
              route.params.datasetId
            }`,
          },
          route.params.projectId ? 4 : 2
        );
      })
      .catch((err) => {
        console.error(err);
        if (err?.response?.status == 404)
          toast.error("Could not find the dataset");
        else toast.error("Something went wrong. Could not fetch datatset");
      });

    if (route.params.projectId) {
      return projectService
        .getById({
          id: route.params.projectId,
          forSelf: !auth.canOperate,
        })
        .then((res) => {
          const project = res.data;
          // setup project details in store
          projectStore.setProject(project);
          // setup project breadcrumbs
          breadcrumbsStore.addNavItem(
            {
              label: project.name,
              to: `/projects/${project.slug}`,
            },
            2
          );
        })
        .catch((err) => {
          console.error(err);
          toast.error("Unable to fetch project details");
        })
        .finally(() => {
          data_loading.value = false;
        });
    }
  }
}

onMounted(() => {
  fetchDatasetAndProject(route);
});

watch(
  () => route.path,
  () => {
    fetchDatasetAndProject(route);
  }
);

watch(
  pwd,
  () => {
    // navigating to a directory disables the search mode
    store.resetFilters();
    isInSearchMode.value = false;
    get_file_list(pwd.value);
  },
  { immediate: true }
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
  { immediate: true }
);

const advancedSearchModal = ref(null);

function openModal() {
  advancedSearchModal.value.show();
}

onUnmounted(() => {
  store.reset();
});
</script>
