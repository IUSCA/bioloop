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
        <DuplicateDatasetFiltersGroup @update="updateFiltersGroupQuery" />
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

      <template #cell(version)="{ value }">
        <span>{{ value }}</span>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ datetime.date(value) }}</span>
      </template>

      <template #cell(num_genome_files)="{ rowData }">
        <Maybe :data="rowData?.metadata?.num_genome_files" />
      </template>

      <template #cell(updated_at)="{ value }">
        <span>{{ datetime.fromNow(value) }}</span>
      </template>

      <template #cell(is_deleted)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(du_size)="{ source }">
        <span>{{ source != null ? formatBytes(source) : "" }}</span>
      </template>

      <template #cell(actions)="{ rowData }">
        <!-- Archive / Delete buttons for RAW_DATA and DATA_PRODUCTS type datasets -->

        <!-- Accept/Reject button for duplicate datasets -->

        <va-popover message="Accept/Reject">
          <va-button
            class="flex-initial"
            size="small"
            preset="primary"
            @click="
              () => {
                router.push(actionItemURL(rowData));
              }
            "
            :disabled="!isProcessed(rowData)"
          >
            <i-mdi-compare-horizontal />
          </va-button>
        </va-popover>
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
  </div>
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import _ from "lodash";

const router = useRouter();
useSearchKeyShortcut();

const props = defineProps({
  dtype: { type: String, required: false },
  label: { type: String, default: "Duplicate" },
});

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const datasets = ref([]);
const filterInput = ref("");
const data_loading = ref(false);
const defaultSortField = ref("updated_at");
const defaultSortOrder = ref("desc");
const currPage = ref(1);
const total_results = ref(0);
const pageSize = ref(20);
// Criteria for group of true/false fields that results can be filtered by
// Deleted, not deleted
const filters_group_query = ref({});

/**
 * Results are fetched in batches for efficient pagination,
 * but the sorting criteria specified needs to query all of persistent storage
 * (as opposed to the current batch of retrieved results). Hence,
 * va-data-table's default sorting behavior (which would normally only sort the
 * current batch of results) is overridden (by providing each column with a
 * `sortingFn` prop that does nothing), and instead,
 * network calls are made to run the sorting criteria across all of persistent
 * storage. The field to sort the results by and the sort order are captured in
 * va-data-table's 'sorted' event, and added to the sorting criteria maintained
 * in the `datasets_sort_query` reactive variable.
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
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
    width: "150px",
  },
  {
    key: "deleted",
    width: "80px",
  },
  {
    key: "version",
    width: "80px",
  },
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
  { key: "actions", width: "100px" },
];

// used for OFFSET clause in the SQL used to retrieve the next paginated batch
// of results
const offset = computed(() => (currPage.value - 1) * pageSize.value);

// Criterion based on search input
const search_query = computed(() => {
  return filterInput.value?.length > 0 && { name: filterInput.value };
});

// Aggregation of all filtering criteria. Used for retrieving results, and
// configuring number of pages for pagination.
const datasets_filter_query = computed(() => {
  return {
    ...(props.dtype && { type: props.dtype }),
    ...filters_group_query.value,
    ...(!!search_query.value && { ...search_query.value }),
  };
});

// Criterion for sorting. Initial sorting order is based on the `updated_at`
// field. The sorting criterion can be updated, which will trigger a call to
// retrieve the updated search results. Note - va-data-table supports sorting by
// one column at a time, so this object should always have a single key-value
// pair.
let datasets_sort_query = computed(() => {
  return { [defaultSortField.value]: defaultSortOrder.value };
});

// Criteria used to limit the number of results retrieved, and to define the
// offset starting at which the next batch of results will be retrieved.
const datasets_batching_query = computed(() => {
  return { offset: offset.value, limit: pageSize.value };
});

// Aggregate of all other criteria. Used for retrieving results according to
// the criteria specified.
const datasets_retrieval_query = computed(() => {
  return {
    ...datasets_filter_query.value,
    ...datasets_batching_query.value,
    sortBy: datasets_sort_query.value,
  };
});

/**
 * Fetches updated list of datasets, based on the query provided,
 * and updates the pagination page-count.
 * Page-count update can be opted out of by providing `false` to
 * updatePageCount.
 */
function fetch_datasets(query = {}, updatePageCount = true) {
  data_loading.value = true;

  return DatasetService.getAll({
    ...datasets_retrieval_query.value,
    ...query,
    is_duplicate: true,
    include_action_items: true,
    include_states: true,
  })
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

const updateFiltersGroupQuery = (newVal) => {
  filters_group_query.value = newVal;
};

const actionItemURL = (dataset) => {
  const actionItem = dataset.action_items[0];
  return actionItem.type === "DUPLICATE_DATASET_INGESTION"
    ? `/datasets/${dataset.id}/actionItems/${actionItem.id}`
    : "#";
};

const isProcessed = (dataset) => {
  // sort states by timestamp (descending).
  const datasetLatestState = dataset.states[0].state;
  return datasetLatestState === "DUPLICATE_READY";
};

onMounted(() => {
  // fetch results to be shown on page load
  fetch_datasets();
});

watch([datasets_sort_query, datasets_filter_query], () => {
  // when sorting or filtering criteria changes, show results starting from the
  // first page
  currPage.value = 1;
});

watch(datasets_retrieval_query, (newQuery, oldQuery) => {
  // Retrieve updated results whenever retrieval criteria changes
  if (!_.isEqual(newQuery, oldQuery)) {
    fetch_datasets();
  }
});
</script>
