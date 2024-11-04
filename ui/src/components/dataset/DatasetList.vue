<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1" v-if="activeFilters.length === 0">
        <va-input
          :model-value="params.inclusive_query"
          class="w-full"
          :placeholder="`Search ${props.label.toLowerCase()}`"
          outline
          clearable
          @update:model-value="handleMainFilter"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- Filter button -->
      <va-button @click="searchModal.show()" preset="primary" class="flex-none">
        <i-mdi-filter />
        <span> Filters </span>
      </va-button>

      <!-- active filter chips -->
      <DatasetSearchFilters
        v-if="activeFilters.length > 0"
        class="flex-none"
        @search="handleSearch"
        @open="searchModal.show()"
      />
    </div>

    <!-- table -->
    <va-data-table
      :items="datasets"
      :columns="columns"
      v-model:sort-by="query.sort_by"
      v-model:sorting-order="query.sort_order"
      disable-client-side-sorting
      :loading="data_loading"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/datasets/${rowData.id}`" class="va-link">{{
          rowData.name
        }}</router-link>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ datetime.date(value) }}</span>
      </template>

      <template #cell(archived)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(staged)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <!-- <template #cell(num_genome_files)="{ rowData }">
        <Maybe :data="rowData?.metadata?.num_genome_files" />
      </template> -->

      <template #cell(source_datasets)="{ source }">
        <Maybe :data="source?.length" :default="0" />
      </template>

      <template #cell(derived_datasets)="{ source }">
        <Maybe :data="source?.length" :default="0" />
      </template>

      <template #cell(updated_at)="{ value }">
        <span>{{ datetime.fromNow(value) }}</span>
      </template>

      <template #cell(du_size)="{ source }">
        <span>{{ source != null ? formatBytes(source) : "" }}</span>
      </template>

      <template #cell(workflows)="{ source }">
        <span>{{ source?.length || 0 }}</span>
      </template>

      <template #cell(actions)="{ rowData }">
        <div class="flex gap-2">
          <va-popover
            message="Archive"
            placement="left"
            v-if="(rowData?.workflows?.length || 0) == 0 && !rowData.is_deleted"
          >
            <va-button
              class="flex-initial"
              size="small"
              preset="primary"
              @click="
                launch_modal.visible = true;
                launch_modal.selected = rowData;
              "
            >
              <i-mdi-rocket-launch />
            </va-button>
          </va-popover>

          <!-- Delete button -->
          <!-- Only show when the dataset has no workflows, is not archived, and has no workflows -->
          <va-popover
            message="Delete entry"
            placement="left"
            v-if="
              (rowData?.workflows?.length || 0) == 0 &&
              !rowData.is_deleted &&
              !rowData.is_archived
            "
          >
            <va-button
              size="small"
              preset="primary"
              color="danger"
              class="flex-initial"
              @click="
                delete_modal.visible = true;
                delete_modal.selected = rowData;
              "
            >
              <i-mdi-delete />
            </va-button>
          </va-popover>
        </div>
      </template>
    </va-data-table>

    <!-- pagination -->
    <Pagination
      class="mt-4 px-1 lg:px-3"
      v-model:page="query.page"
      v-model:page_size="query.page_size"
      :total_results="total_results"
      :curr_items="datasets.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />

    <!-- launch modal -->
    <va-modal
      :title="`Archive ${props.label} ${launch_modal.selected?.name}`"
      :model-value="launch_modal.visible"
      size="small"
      okText="Archive"
      @ok="
        launch_modal.visible = false;
        launch_wf(launch_modal.selected?.id);
        launch_modal.selected = null;
      "
      @cancel="
        launch_modal.visible = false;
        launch_modal.selected = null;
      "
    >
      <div class="flex flex-col gap-3">
        <p>
          By clicking the "Archive" button, a workflow will be initiated to
          archive the {{ props.label.toLowerCase() }} to the SDA (Secure Data
          Archive).
        </p>
        <p>
          Please be aware that the time it takes to complete this process
          depends on the size of the directory and the amount of data being
          archived. To monitor the progress of the workflow, you can view the
          dataset's details page.
        </p>
      </div>
    </va-modal>

    <!-- delete modal -->
    <va-modal
      :title="`Delete ${delete_modal.selected?.name}?`"
      :model-value="delete_modal.visible"
      size="small"
      okText="Delete"
      @ok="
        delete_modal.visible = false;
        delete_dataset(delete_modal.selected?.id);
        delete_modal.selected = null;
      "
      @cancel="
        delete_modal.visible = false;
        delete_modal.selected = null;
      "
    >
      <div class="flex flex-col gap-3">
        <p>
          Please note that this action will delete the database entry and will
          not delete any associated files.
        </p>
      </div>
    </va-modal>

    <DatasetSearchModal ref="searchModal" @search="handleSearch" />
  </div>
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import config from "@/config";
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import { useDatasetStore } from "@/stores/dataset";
import { storeToRefs } from "pinia";

useSearchKeyShortcut();

const props = defineProps({
  dtype: String,
  label: String,
});

const store = useDatasetStore();
const { filters, query, params, activeFilters } = storeToRefs(store);

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const datasets = ref([]);
const data_loading = ref(false);
const launch_modal = ref({
  visible: false,
  selected: null,
});
const delete_modal = ref({
  visible: false,
  selected: null,
});
const searchModal = ref(null);
const total_results = ref(0);

// used for OFFSET clause in the SQL used to retrieve the next paginated batch
// of results
const offset = computed(() => (query.value.page - 1) * query.value.page_size);

useQueryPersistence({
  refObject: params,
  defaultValueFn: store.defaultParams,
  key: "q",
  history_push: true,
});

const columns = [
  // { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "name",
    sortable: true,
  },
  {
    key: "du_size",
    label: "size",
    sortable: true,
    width: "100px",
  },
  {
    key: "archive_path",
    name: "archived",
    label: "archived",
    thAlign: "center",
    tdAlign: "center",
    width: "80px",
  },
  {
    key: "is_staged",
    name: "staged",
    label: "staged",
    thAlign: "center",
    tdAlign: "center",
    width: "80px",
  },
  {
    key: "created_at",
    label: "registered on",
    sortable: true,
    width: "100px",
  },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    width: "150px",
  },
  {
    key: "source_datasets",
    label: "Sources",
    width: "80px",
  },
  {
    key: "derived_datasets",
    label: "Derived",
    width: "80px",
  },
  ...(config.enabledFeatures.genomeBrowser
    ? [
        {
          key: "num_genome_files",
          label: "data files",
          width: "80px",
        },
      ]
    : []),
  // {
  //   key: "workflows",
  //   thAlign: "center",
  //   tdAlign: "center",
  //   width: "80px",
  // },
  // { key: "actions", width: "100px" },
];

// function getRowBind(row) {
//   // const active_wf = row.workflows?.filter(
//   //   (workflow) => !workflowService.is_workflow_done(workflow)
//   // );
//   // const is_in_progress = (active_wf?.length || 0) > 0;
//   // if (is_in_progress) {
//   //   return { class: ["bg-slate-200"] };
//   // }
//   // highlight deleted datasets
//   if (row.is_deleted) {
//     return { class: ["bg-slate-200"] };
//   }
// }

function fetch_items() {
  data_loading.value = true;
  const filters_api = {
    ...filters.value,
    ...(params.value.inclusive_query
      ? { name: params.value.inclusive_query }
      : null),
    type: props.dtype,
  };
  if (filters_api.created_at) {
    filters_api.created_at_start = filters_api.created_at.start;
    filters_api.created_at_end = filters_api.created_at.end;
    delete filters_api.created_at;
  }
  if (filters_api.updated_at) {
    filters_api.updated_at_start = filters_api.updated_at.start;
    filters_api.updated_at_end = filters_api.updated_at.end;
    delete filters_api.updated_at;
  }
  DatasetService.getAll({
    limit: query.value.page_size,
    offset: offset.value,
    sort_by: query.value.sort_by,
    sort_order: query.value.sort_order,
    ...filters_api,
  })
    .then((res) => {
      datasets.value = res.data?.datasets || [];
      total_results.value = res.data?.metadata?.count || 0;
    })
    .finally(() => {
      data_loading.value = false;
    });
}

onMounted(() => {
  fetch_items();
});
// when sort by or sort order changes, set current page to 1 and fetch items
// when page size changes, set current page to 1 and fetch items
watch(
  [
    () => query.value.sort_by,
    () => query.value.sort_order,
    () => query.value.page_size,
  ],
  () => {
    if (query.value.page === 1) {
      fetch_items();
    } else {
      // change current page to 1 triggers the watch on currPage and fetches
      // items
      query.value.page = 1;
    }
  },
);

// when page changes, fetch items
watch(() => query.value.page, fetch_items);

// inclusive_query is changed from multiple locations, do not watch it directly
// instead rely on VaInput's update:model-value event to fetch items
const handleMainFilter = useDebounceFn((value) => {
  params.value.inclusive_query = value;
  if (query.value.page === 1) {
    fetch_items();
  } else {
    // change current page to 1 triggers the watch on currPage and fetches items
    query.value.page = 1;
  }
}, 300);

function handleSearch() {
  // clear the search input when search is emitted either from filter chips or
  // from search modal
  params.value.inclusive_query = null;
  if (query.value.page === 1) {
    fetch_items();
  } else {
    // change current page to 1 triggers the watch on currPage and fetches items
    query.value.page = 1;
  }
}

function launch_wf(id) {
  data_loading.value = true;
  DatasetService.archive_dataset(id)
    .then(() => {
      toast.success(`Launched a workflow to archive the dataset: ${id}`);
      fetch_items();
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to archive the dataset");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

function delete_dataset(id) {
  data_loading.value = true;
  DatasetService.delete_dataset({ id, soft_delete: false })
    .then(() => {
      toast.success(`Deleted dataset: ${id}`);
      fetch_items();
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to delete dataset");
    })
    .finally(() => {
      data_loading.value = false;
    });
}
</script>
