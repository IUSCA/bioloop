<template>
  <AdvancedSearch
    v-model:search-term="searchTerm"
    :search-results="datasets"
    :total-result-count="totalResultCount"
    @scroll-end="loadNextSearchResults"
    :count-label="countLabel"
    placeholder="Search Datasets by name"
    selected-label="Datasets to assign"
    :selected-results="props.selectedResults"
    :search-result-columns="retrievedDatasetColumns"
    :selected-result-columns="selectedDatasetColumns"
    @reset="
      () => {
        searchTerm = ''; // watcher on searchTerm takes care of resetting the search state
        // reset filters
        checkboxes.rawData = false;
        checkboxes.dataProduct = false;
      }
    "
    @input="(input) => (searchTerm = input)"
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
import { useBreakpoint } from "vuestic-ui";

const NAME_TRIM_THRESHOLD = 15;
const PAGE_SIZE = 10;

const props = defineProps({
  selectedResults: {
    type: Array,
    default: () => [],
  },
});

const breakpoint = useBreakpoint();

// const totalResults = ref(0);
const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});
const datasets = ref([]);
const totalResultCount = ref(0);

const searchTerm = ref("");

const countLabel = computed(() => {
  return `Showing ${datasets.value.length} of
                      ${totalResultCount.value}
                      ${searchTerm.value !== "" ? "filtered " : ""}
                      results`;
});

const loadNextSearchResults = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const columnWidths = computed(() => {
  return {
    name: breakpoint.xs || breakpoint.sm ? "165px" : "175px",
    type: "120px",
    size: "100px",
    created_at: "105px",
  };
});

const trimName = (val) =>
  val.length > NAME_TRIM_THRESHOLD
    ? val.substring(0, NAME_TRIM_THRESHOLD) + "..."
    : val;

const primaryColumns = computed(() => {
  return [
    {
      key: "name",
      label: "Name",
      width: columnWidths.value.name,
      formatFn: trimName,
    },
    {
      key: "type",
      label: "Type",
      slotted: true,
      width: columnWidths.value.type,
    },
  ];
});

const secondaryColumns = computed(() => {
  return [
    {
      key: "size",
      label: "Size",
      formatFn: (val) => formatBytes(val),
      width: columnWidths.value.size,
    },
    {
      key: "created_at",
      label: "Registered On",
      formatFn: (val) => date(val),
      width: columnWidths.value.created_at,
    },
  ];
});

const retrievedDatasetColumns = computed(() => {
  return breakpoint.sm || breakpoint.xs
    ? primaryColumns.value
    : primaryColumns.value.concat(secondaryColumns.value);
});

const selectedDatasetColumns = computed(() =>
  primaryColumns.value.filter((col) => col.key === "name"),
);

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

const filterQuery = computed(() => {
  const selectedDatasetType = checkboxes.value.rawData
    ? "RAW_DATA"
    : checkboxes.value.dataProduct
      ? "DATA_PRODUCT"
      : undefined;

  return {
    type: selectedDatasetType,
  };
});

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const loadResults = () => {
  debugger;
  datasetService.getAll(fetchQuery.value).then((res) => {
    datasets.value = datasets.value.concat(res.data.datasets);
    totalResultCount.value = res.data.metadata.count;
  });
};

const fetchQuery = computed(() => {
  let ret = {
    ...(searchTerm.value && { name: searchTerm.value }),
    ...(lxor(checkboxes.value.rawData, checkboxes.value.dataProduct) && {
      ...filterQuery.value,
    }),
    ...batchingQuery.value,
  };
  // debugger;
  return ret;
});

// resets search result selections
// const resetSearchSelections = () => {
//   // searchResultSelections.value = [];
// };

watch([searchTerm, filterQuery], () => {
  resetSearchState();
});

const resetSearchState = () => {
  // resetSearchSelections();
  // reset search results
  datasets.value = [];
  // reset page value
  page.value = 1;
};

onMounted(() => {
  loadResults();
});
</script>
