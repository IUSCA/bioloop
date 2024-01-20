<template>
  <AdvancedSearch
    placeholder="Search Datasets by name"
    selected-label="Datasets to assign"
    :selected-results="props.selectedResults"
    :query="query"
    :search-result-columns="retrievedDatasetColumns"
    :selected-result-columns="selectedDatasetColumns"
    :fetch-fn="datasetService.getAll"
    search-field="name"
    results-by="datasets"
    count-by="metadata.count"
    :page-size="5"
    resource="dataset"
    @reset="
      () => {
        checkboxes.rawData = false;
        checkboxes.dataProduct = false;
      }
    "
  >
    <template #filters>
      <va-button-dropdown
        :label="`Filters${activeCountText}`"
        :close-on-content-click="false"
      >
        <div class="flex flex-col gap-1">
          <va-checkbox v-model="checkboxes.rawData" label="Raw Data" />
          <va-checkbox v-model="checkboxes.dataProduct" label="Data Products" />
        </div>
      </va-button-dropdown>
    </template>

    <template #type="slotProps">
      <DatasetType
        :type="slotProps['value']"
        :show-icon="!(breakpoint.sm || breakpoint.xs)"
      />
    </template>
  </AdvancedSearch>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { date } from "@/services/datetime";
import { formatBytes, lxor } from "@/services/utils";
import _ from "lodash";
import { useBreakpoint } from "vuestic-ui";

const props = defineProps({
  selectedResults: {
    type: Array,
    default: () => [],
  },
});

const breakpoint = useBreakpoint();

const BASE_FILTER_QUERY = { sortBy: { name: "asc" }, limit: 5 };
const COLUMN_WIDTHS = {
  name: "190px",
  type: "120px",
  size: "100px",
  created_at: "105px",
};

const trimName = (val) =>
  val.length > 17 ? val.substring(0, 17) + "..." : val;

const mobileViewColumns = [
  {
    key: "name",
    label: "Name",
    width: COLUMN_WIDTHS.name,
    formatFn: trimName,
  },
  {
    key: "type",
    label: "Type",
    slotted: true,
    width: COLUMN_WIDTHS.type,
  },
];

const desktopViewColumns = [
  {
    key: "size",
    label: "Size",
    formatFn: (val) => formatBytes(val),
    width: COLUMN_WIDTHS.size,
  },
  {
    key: "created_at",
    label: "Registered On",
    formatFn: (val) => date(val),
    width: COLUMN_WIDTHS.created_at,
  },
];

const retrievedDatasetColumns = computed(() => {
  return breakpoint.sm || breakpoint.xs
    ? mobileViewColumns
    : mobileViewColumns.concat(desktopViewColumns);
});

const selectedDatasetColumns = [
  {
    key: "name",
    label: "Name",
    width: COLUMN_WIDTHS.name,
    formatFn: trimName,
  },
];

const checkboxes = ref({
  rawData: false,
  dataProduct: false,
});
const activeCountText = computed(() => {
  const activeCount = Object.values(checkboxes.value).filter(
    (val) => !!val,
  ).length;
  return activeCount > 0 ? ` (${activeCount})` : "";
});
const query = computed(() => {
  const selectedDatasetType = checkboxes.value.rawData
    ? "RAW_DATA"
    : checkboxes.value.dataProduct && "DATA_PRODUCT";

  return {
    type: lxor(checkboxes.value.rawData, checkboxes.value.dataProduct)
      ? selectedDatasetType
      : undefined,
  };
});

const searches = ref([]); // array of Promises, where each Promise represents a search operation
const searchStack = ref([]); // stack that is pushed to when a search is started, and
// popped from when a search resolves
const datasets = ref([]); // Options passed to the <select />
const loading = ref(false);
const searchText = ref("");
const searchQuery = computed(() => {
  return {
    ...BASE_FILTER_QUERY,
    ...(searchText.value && { name: searchText.value }),
  };
});

const search = (query) => {
  loading.value = true;
  searchStack.value.push(null);

  return new Promise((resolve) => {
    let response;
    datasetService
      .getAll(query || BASE_FILTER_QUERY)
      .then((res) => {
        response = res;
      })
      .catch((e) => {
        console.log(e);
      })
      .finally(() => {
        searchStack.value.pop();
        resolve(response); // always resolve. Enables recovery from network errors without
        // page refresh
      });
  });
};

// Watcher that triggers when a new search is run
watch(searchQuery, (value, oldValue) => {
  if (!_.isEqual(value, oldValue)) {
    searches.value.push(search(searchQuery.value));
  }
});

watch(
  searchStack,
  () => {
    // If stack is empty, all searches have been resolved
    if (searchStack.value.length === 0) {
      Promise.all(searches.value).then((responses) => {
        const latestResponse = responses[responses.length - 1];
        datasets.value = latestResponse.data.datasets;
        loading.value = false;
      });
    }
  },
  { deep: true },
);

onMounted(() => {
  searches.value.push(search());
});
</script>
