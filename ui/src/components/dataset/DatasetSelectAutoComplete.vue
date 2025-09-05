<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    :async="true"
    :paginated="true"
    :paginated-total-results-count="totalResultsCount"
    :data="datasets"
    :display-by="'name'"
    @clear="onClear"
    @load-more="loadNextPage"
    placeholder="Search Datasets by name"
    :loading="loading"
    @select="onSelect"
    @open="onOpen"
    @close="onClose"
    :disabled="props.disabled"
    :label="props.label"
    :messages="props.messages"
    :data-test-id="props.dataTestId"
  />
</template>

<script setup>
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import _ from "lodash";

// const NAME_TRIM_THRESHOLD = 35;
const PAGE_SIZE = 10;

const props = defineProps({
  selected: {
    type: [String, Object],
  },
  searchTerm: {
    type: String,
    default: "",
  },
  datasetType: {
    type: String,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
  },
  messages: {
    type: Array,
    default: () => [],
  },
  dataTestId: {
    type: String,
    default: "dataset-autocomplete",
  },
});

const emit = defineEmits([
  "clear",
  "open",
  "close",
  "update:selected",
  "update:searchTerm",
]);

const loading = ref(false);
const datasets = ref([]);
const totalResultsCount = ref(0);
const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});
const searchTerm = computed({
  get: () => {
    return props.searchTerm;
  },
  set: (val) => {
    emit("update:searchTerm", val);
  },
});

const debouncedSearch = ref(null);
const searchIndex = ref(0);
const searches = ref([]);
const latestQuery = ref(null);

const onSelect = (item) => {
  emit("update:searchTerm", item.name);
  emit("update:selected", item);
};

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return searchDatasets({ appendToCurrentResults: true });
};

const filterQuery = computed(() => {
  let query;
  if (props.datasetType) {
    query = {
      type: props.datasetType,
    };
  } else {
    query = {
      type: undefined,
    };
  }

  return { ...query, deleted: props.fetchInactive };
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
        totalResultsCount.value = res.data?.metadata?.count;
        resolveSearch(res.queryIndex);
      })
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load datasets");
      });
  }
};

const resolveSearch = (searchIndex) => {
  searches.value.splice(searches.value.indexOf(searchIndex), 1);
  if (searches.value.length === 0) {
    loading.value = false;
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

const onOpen = () => {
  emit("open");
};

const onClose = () => {
  emit("close");
};

const onClear = () => {
  emit("clear");
};

watch([searchTerm, filterQuery], () => {
  searchIndex.value += 1;
  searches.value.push(searchIndex.value);

  loading.value = true;

  debouncedSearch.value = _.debounce(performSearch, 300);
  debouncedSearch.value(searchIndex.value);
});

onMounted(() => {
  loading.value = true;
  searchDatasets();
});

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel();
  }
});
</script>

<style scoped></style>
