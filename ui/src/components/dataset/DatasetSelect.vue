<template>
  <SearchAndSelect
    v-model:searchTerm="searchTerm"
    :search-results="datasets"
    :selected-results="props.selectedResults"
    :search-result-count="totalResultCount"
    placeholder="Search Datasets by name"
    selected-label="Datasets to assign"
    @scroll-end="loadNextPage"
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
  </SearchAndSelect>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { date } from "@/services/datetime";
import { formatBytes, lxor } from "@/services/utils";
import { useBreakpoint } from "vuestic-ui";
import toast from "@/services/toast";

const NAME_TRIM_THRESHOLD = 13;
const PAGE_SIZE = 10;

const props = defineProps({
  selectedResults: {
    type: Array,
    default: () => [],
  },
  columnWidths: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["loading", "loaded"]);

const breakpoint = useBreakpoint();

const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});
const datasets = ref([]);
const totalResultCount = ref(0);

const searchTerm = ref("");

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const trimName = (val) =>
  val.length > NAME_TRIM_THRESHOLD
    ? val.substring(0, NAME_TRIM_THRESHOLD) + "..."
    : val;

const primaryColumns = computed(() => {
  return [
    {
      key: "name",
      label: "Name",
      width: props.columnWidths.name,
      formatFn: trimName,
    },
    {
      key: "type",
      label: "Type",
      slotted: true,
      width: props.columnWidths.type,
    },
  ];
});

const secondaryColumns = computed(() => {
  return [
    {
      key: "size",
      label: "Size",
      formatFn: (val) => formatBytes(val),
      width: props.columnWidths.size,
    },
    {
      key: "created_at",
      label: "Registered On",
      formatFn: (val) => date(val),
      width: props.columnWidths.created_at,
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
  return lxor(checkboxes.value.rawData, checkboxes.value.dataProduct)
    ? {
        type: checkboxes.value.rawData
          ? "RAW_DATA"
          : checkboxes.value.dataProduct
            ? "DATA_PRODUCT"
            : undefined,
      }
    : undefined;
});

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { name: searchTerm.value }),
    ...filterQuery.value,
    ...batchingQuery.value,
  };
});

const loadResults = () => {
  emit("loading");
  return datasetService
    .getAll(fetchQuery.value)
    .then((res) => {
      datasets.value = datasets.value.concat(res.data.datasets);
      totalResultCount.value = res.data.metadata.count;
    })
    .catch(() => {
      toast.error("Failed to load datasets");
    })
    .finally(() => {
      emit("loaded");
    });
};

watch([searchTerm, filterQuery], () => {
  resetSearchState();
});

const resetSearchState = () => {
  // reset search results
  datasets.value = [];
  // reset page value
  page.value = 1;
  // load initial set of search results
  loadResults();
};

onMounted(() => {
  loadResults();
});
</script>
