<template>
  <SearchAndSelect
    v-model:searchTerm="searchTerm"
    :search-results="datasets"
    :selected-results="props.selectedResults"
    :search-result-count="totalResultCount"
    :selectMode="props.selectMode"
    placeholder="Search Datasets by name"
    :selected-label="props.selectedLabel"
    @scroll-end="loadNextPage"
    :search-result-columns="retrievedDatasetColumns"
    :selected-result-columns="selectedDatasetColumns"
    :loading="loadingResources"
    :show-error="props.showError"
    :error="props.error"
    :messages="props.messages"
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
        v-if="!props.datasetType"
        :label="`Filters${activeCountText}`"
        :close-on-content-click="false"
      >
        <div class="flex flex-col gap-1">
          <va-checkbox v-model="checkboxes.rawData" label="Raw Data" />
          <va-checkbox v-model="checkboxes.dataProduct" label="Data Products" />
        </div>
      </va-button-dropdown>
    </template>

    <template #name="slotProps">
      <va-popover placement="top" :message="slotProps['value'].raw">
        {{ slotProps["value"].formatted }}
      </va-popover>
    </template>

    <template #type="slotProps">
      <DatasetType
        :type="slotProps['value'].raw"
        :show-icon="true"
        :show-type="false"
      />
    </template>
  </SearchAndSelect>
</template>

<script setup>
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import _ from "lodash";
import { lxor } from "@/services/utils";

const NAME_TRIM_THRESHOLD = 35;
const PAGE_SIZE = 10;

const props = defineProps({
  datasetType: {
    type: String,
  },
  selectedResults: {
    type: Array,
    default: () => [],
  },
  columnWidths: {
    type: Object,
    required: true,
  },
  selectMode: {
    type: String,
    default: () => "multiple",
  },
  showError: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
  },
  selectedLabel: {
    type: String,
    default: () => "Selected Datasets",
  },
  messages: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["loading", "loaded"]);

const loadingResources = inject("loadingResources");

const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});
const datasets = ref([]);
const totalResultCount = ref(0);

const searchTerm = ref(undefined);
const debouncedSearch = ref(null);
const searchIndex = ref(0);
const searches = ref([]);
const latestQuery = ref(null);

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return searchDatasets({ appendToCurrentResults: true });
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
      width: props.columnWidths?.name,
      formatFn: trimName,
      slotted: true,
    },
    {
      key: "type",
      label: "Type",
      slotted: true,
      width: props.columnWidths?.type,
    },
  ];
});

const retrievedDatasetColumns = computed(() => {
  return primaryColumns.value;
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
  if (props.datasetType) {
    return {
      type: props.datasetType,
    };
  } else {
    return lxor(checkboxes.value.rawData, checkboxes.value.dataProduct)
      ? {
          type: checkboxes.value.rawData
            ? "RAW_DATA"
            : checkboxes.value.dataProduct
              ? "DATA_PRODUCT"
              : undefined,
        }
      : undefined;
  }
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

const queryDatasets = ({ queryIndex = null, query = null } = {}) => {
  return datasetService.getAll(query).then((res) => {
    return { data: res.data, ...(queryIndex && { queryIndex }) };
  });
};

const searchDatasets = ({
  searchIndex = null,
  appendToCurrentResults = false,
  logQuery = false,
} = {}) => {
  // Ensure that the same query is not being run a second time (which
  // is possible due to debounced searches). If it is, the search
  // can be resolved immediately.
  if (_.isEqual(latestQuery.value, fetchQuery.value)) {
    resolveSearch(searchIndex);
  } else {
    if (logQuery) {
      latestQuery.value = fetchQuery.value;
    }

    return queryDatasets({
      ...(searchIndex && { queryIndex: searchIndex }),
      query: fetchQuery.value,
    })
      .then((res) => {
        datasets.value = appendToCurrentResults
          ? datasets.value.concat(res.data.datasets)
          : res.data.datasets;
        totalResultCount.value = res.data.metadata.count;
        resolveSearch(res.queryIndex);
      })
      .catch(() => {
        toast.error("Failed to load datasets");
      });
  }
};

const resolveSearch = (searchIndex) => {
  searches.value.splice(searches.value.indexOf(searchIndex), 1);
  if (searches.value.length === 0) {
    emit("loaded");
  }
};

const performSearch = (searchIndex) => {
  // reset page value
  page.value = 1;
  // load search results
  searchDatasets({
    searchIndex,
    appendToCurrentResults: false,
    logQuery: true,
  });
};

watch([searchTerm, filterQuery], () => {
  searchIndex.value += 1;
  searches.value.push(searchIndex.value);

  emit("loading");

  debouncedSearch.value = _.debounce(performSearch, 300);
  debouncedSearch.value(searchIndex.value);
});

onMounted(() => {
  emit("loading");
  searchDatasets();
});

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel();
  }
});
</script>
