<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1">
        <va-input
          v-model="filterInput"
          class="w-full"
          :placeholder="`Type / to search ${props.label.toLowerCase()}`"
          outline
          clearable
          input-class="search-input"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- filter -->
      <div class="flex-none flex items-center justify-center">
        <filters-group @update="updateFiltersGroupQuery"></filters-group>
      </div>
    </div>

    <!-- table -->
    <va-data-table
      :items="datasets"
      :columns="columns"
      v-model:sort-by="defaultSortField"
      v-model:sorting-order="defaultSortOrder"
      :loading="data_loading"
      @sorted="
        (attrs) => {
          defaultSortField = attrs.sortBy;
          defaultSortOrder = attrs.sortingOrder;
        }
      "
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

      <template #cell(num_genome_files)="{ rowData }">
        <Maybe :data="rowData?.metadata?.num_genome_files" />
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
      v-model:page="currPage"
      v-model:page_size="pageSize"
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
  </div>
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import { useToastStore } from "@/stores/toast";
import _ from "lodash";

const toast = useToastStore();
useSearchKeyShortcut();

const props = defineProps({
  dtype: String,
  label: String,
});

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const datasets = ref([]);
const filterInput = ref("");
const data_loading = ref(false);
const launch_modal = ref({
  visible: false,
  selected: null,
});
const delete_modal = ref({
  visible: false,
  selected: null,
});
const defaultSortField = ref("updated_at");
const defaultSortOrder = ref("desc");
const currPage = ref(1);
const total_results = ref(0);
const pageSize = ref(20);
// Criteria for group of true/false fields that results can be filtered by
const filters_group_query = ref({});

/**
 * Results are fetched in batches for efficient pagination, but the sorting criteria specified
 * needs to query all of persistent storage (as opposed to the current batch of retrieved results).
 * Hence, va-data-table's default sorting behavior (which would normally only sort the current
 * batch of results) is overridden (by providing each column with a `sortingFn` prop that does
 * nothing), and instead, network calls are made to run the sorting criteria across all of
 * persistent storage. The field to sort the results by and the sort order are captured in
 * va-data-table's 'sorted' event, and added to the sorting criteria maintained in the
 * `datasets_sort_query` reactive variable.
 */
const columns = [
  // { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "name",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
  },
  {
    key: "created_at",
    label: "registered on",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
    width: "100px",
  },
  {
    key: "archive_path",
    name: "archived",
    label: "archived",
    thAlign: "center",
    tdAlign: "center",
    width: "100px",
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
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
    width: "150px",
  },
  // { key: "status", sortable: false },
  {
    key: "num_genome_files",
    label: "data files",
    width: "80px",
  },
  {
    key: "du_size",
    label: "size",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
    width: "100px",
  },
  {
    key: "workflows",
    thAlign: "center",
    tdAlign: "center",
    width: "80px",
  },
  { key: "actions", width: "100px" },
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

// used for OFFSET clause in the SQL used to retrieve the next paginated batch of results
const offset = computed(() => (currPage.value - 1) * pageSize.value);

// Criterion based on search input
const search_query = computed(() => {
  return filterInput.value?.length > 0 && { name: filterInput.value };
});

// Aggregation of all filtering criteria. Used for retrieving results, and configuring number of
// pages for pagination.
const datasets_filter_query = computed(() => {
  return {
    type: props.dtype,
    ...filters_group_query.value,
    ...(!!search_query.value && { ...search_query.value }),
  };
});

// Criterion for sorting. Initial sorting order is based on the `updated_at` field. The sorting
// criterion can be updated, which will trigger a call to retrieve the updated search results.
// Note - va-data-table supports sorting by one column at a time, so this object should always have
// a single key-value pair.
let datasets_sort_query = computed(() => {
  return { [defaultSortField.value]: defaultSortOrder.value };
});

// Criteria used to limit the number of results retrieved, and to define the offset starting at
// which the next batch of results will be retrieved.
const datasets_batching_query = computed(() => {
  return { offset: offset.value, limit: pageSize.value };
});

// Aggregate of all other criteria. Used for retrieving results according to the criteria
// specified.
const datasets_retrieval_query = computed(() => {
  return {
    ...datasets_filter_query.value,
    ...datasets_batching_query.value,
    sortBy: datasets_sort_query.value,
  };
});

/**
 * Fetches updated list of datasets, based on the query provided, and updates the pagination
 * page-count. Page-count update can be opted out of by providing `false` to updatePageCount.
 */
function fetch_datasets(query = {}, updatePageCount = true) {
  data_loading.value = true;

  return DatasetService.getAll({ ...datasets_retrieval_query.value, ...query })
    .then((res) => {
      datasets.value = res.data.datasets;
      if (updatePageCount) {
        total_results.value = res.data.metadata.count;
      }
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch data");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

function launch_wf(id) {
  data_loading.value = true;
  DatasetService.archive_dataset(id)
    .then(() => {
      toast.success(`Launched a workflow to archive the dataset: ${id}`);
      fetch_datasets();
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
      fetch_datasets();
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to delete dataset");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

const updateFiltersGroupQuery = (newVal) => {
  filters_group_query.value = newVal;
};

onMounted(() => {
  // fetch results to be shown on page load
  fetch_datasets();
});

watch([datasets_sort_query, datasets_filter_query], () => {
  // when sorting or filtering criteria changes, show results starting from the first page
  currPage.value = 1;
});

watch(datasets_retrieval_query, (newQuery, oldQuery) => {
  // Retrieve updated results whenever retrieval criteria changes
  if (!_.isEqual(newQuery, oldQuery)) {
    fetch_datasets();
  }
});
</script>
