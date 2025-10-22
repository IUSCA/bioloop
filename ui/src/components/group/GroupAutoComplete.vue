<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    :async="true"
    :paginated="true"
    :paginated-total-results-count="totalResultsCount"
    :data="groups"
    :display-by="'name'"
    @clear="onClear"
    @load-more="loadNextPage"
    placeholder="Search groups by name"
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
import groupService from "@/services/group";
import toast from "@/services/toast";
import _ from "lodash";

const PAGE_SIZE = 10;

const props = defineProps({
  selected: {
    type: [String, Object],
  },
  searchTerm: {
    type: String,
    default: "",
  },
  excludeIds: {
    type: Array,
    default: () => [],
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
    default: "group-autocomplete",
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
const groups = ref([]);
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
  page.value += 1;
  return searchGroups({ appendToCurrentResults: true });
};

const batchingQuery = computed(() => {
  return {
    skip: skip.value,
    take: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { search: searchTerm.value }),
    ...batchingQuery.value,
  };
});

const queryGroups = ({ queryIndex = null, query = null } = {}) => {
  return groupService.getAll(query).then((res) => {
    return { data: res.data, ...(queryIndex && { queryIndex }) };
  });
};

const searchGroups = ({
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

    return queryGroups({
      ...(searchIndex && { queryIndex: searchIndex }),
      query: fetchQuery.value,
    })
      .then((res) => {
        // Filter out excluded IDs
        const filteredGroups = res.data.groups.filter(
          (g) => !props.excludeIds.includes(g.id)
        );

        groups.value = appendToCurrentResults
          ? groups.value.concat(filteredGroups)
          : filteredGroups;
        totalResultsCount.value = res.data?.metadata?.count || 0;
        resolveSearch(res.queryIndex);
      })
      .catch(() => {
        toast.error("Failed to load groups");
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
  searchGroups({
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

watch([searchTerm], () => {
  searchIndex.value += 1;
  searches.value.push(searchIndex.value);

  loading.value = true;

  debouncedSearch.value = _.debounce(performSearch, 300);
  debouncedSearch.value(searchIndex.value);
});

onMounted(() => {
  loading.value = true;
  searchGroups();
});

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel();
  }
});
</script>

<style scoped></style>
