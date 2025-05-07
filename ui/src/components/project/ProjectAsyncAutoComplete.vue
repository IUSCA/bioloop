<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    :async="true"
    :paginated="true"
    :paginated-total-results-count="totalResultsCount"
    :data="projects"
    :display-by="'name'"
    @clear="onClear"
    @load-more="loadNextPage"
    placeholder="Search Projects by name"
    :loading="loading"
    @select="onSelect"
    @open="onOpen"
    @close="onClose"
    :disabled="props.disabled"
    :label="props.label"
    :messages="props.messages"
  />
</template>

<script setup>
import projectService from "@/services/projects";
import toast from "@/services/toast";
import _ from "lodash";
import { useAuthStore } from "@/stores/auth";

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
});

const emit = defineEmits([
  "clear",
  "open",
  "close",
  "load-initial",
  "update:selected",
  "update:searchTerm",
]);

const auth = useAuthStore();

const loading = ref(false);
const projects = ref([]);
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
  return searchProjects({ appendToCurrentResults: true });
};

// const trimName = (val) =>
//   val.length > NAME_TRIM_THRESHOLD
//     ? val.substring(0, NAME_TRIM_THRESHOLD) + "..."
//     : val;

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { search: searchTerm.value }),
    ...batchingQuery.value,
  };
});

const queryProjects = ({ queryIndex = null, query = null } = {}) => {
  return projectService
    .getAll({
      ...query,
      forSelf: !(auth.canOperate || auth.canAdmin),
    })
    .then((res) => {
      return { data: res.data, ...(queryIndex && { queryIndex }) };
    });
};

const searchProjects = ({
  isInitialLoad = false,
  searchIndex = null,
  appendToCurrentResults = false,
  logQuery = false,
} = {}) => {
  console.log("searching", fetchQuery.value);
  // Ensure that the same query is not being run a second time (which
  // is possible due to debounced searches). If it is, the search
  // can be resolved immediately.
  if (_.isEqual(latestQuery.value, fetchQuery.value)) {
    resolveSearch(searchIndex);
  } else {
    if (logQuery) {
      latestQuery.value = fetchQuery.value;
    }

    return queryProjects({
      ...(searchIndex && { queryIndex: searchIndex }),
      query: fetchQuery.value,
    })
      .then((res) => {
        projects.value = appendToCurrentResults
          ? projects.value.concat(res.data.projects)
          : res.data.projects;
        totalResultsCount.value = res.data?.metadata?.count || 0;
        resolveSearch(res.queryIndex, isInitialLoad);
      })
      .catch(() => {
        toast.error("Failed to load datasets");
      });
  }
};

const resolveSearch = (searchIndex, isInitialLoad = false) => {
  searches.value.splice(searches.value.indexOf(searchIndex), 1);
  if (searches.value.length === 0) {
    loading.value = false;
    if (isInitialLoad) {
      emit("load-initial", projects.value);
    }
  }
};

const performSearch = (searchIndex) => {
  // reset page value
  page.value = 1;
  // load search results
  searchProjects({
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
  searchProjects({ isInitialLoad: true });
});

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel();
  }
});
</script>

<style scoped></style>
