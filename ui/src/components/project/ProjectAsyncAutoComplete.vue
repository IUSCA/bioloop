<template>
  <!--  v-model:populated-result="populatedResult"-->

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
  />
</template>

<script setup>
import projectService from "@/services/projects";
import toast from "@/services/toast";
import _ from "lodash";
import { useAuthStore } from "@/stores/auth";

const NAME_TRIM_THRESHOLD = 35;
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
});

const emit = defineEmits([
  "clear",
  "open",
  "close",
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
  // selectedResult.value = item
  // emit('select', item)
  emit("update:selected", item);
};

const loadNextPage = () => {
  // console.log('loadNextPage')
  // console.log('searchTerm:', searchTerm.value)
  page.value += 1; // increase page value for offset recalculation
  return searchProjects({ appendToCurrentResults: true });
};

// todo - move to utils
const trimName = (val) =>
  val.length > NAME_TRIM_THRESHOLD
    ? val.substring(0, NAME_TRIM_THRESHOLD) + "..."
    : val;

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
    .getAll({ ...query, forSelf: !auth.canOperate })
    .then((res) => {
      return { data: res.data, ...(queryIndex && { queryIndex }) };
    });
};

const searchProjects = ({
  searchIndex = null,
  appendToCurrentResults = false,
  logQuery = false,
} = {}) => {
  // Ensure that the same query is not being run a second time (which
  // is possible due to debounced searches). If it is, the search
  // can be resolved immediately.
  console.log("latestQuery:", latestQuery.value);
  console.log("fetchQuery:", fetchQuery.value);

  if (_.isEqual(latestQuery.value, fetchQuery.value)) {
    resolveSearch(searchIndex);
  } else {
    if (logQuery) {
      latestQuery.value = fetchQuery.value;
    }

    console.log("will search projects:", fetchQuery.value);
    return queryProjects({
      ...(searchIndex && { queryIndex: searchIndex }),
      query: fetchQuery.value,
    })
      .then((res) => {
        console.log("search results:", res.data.projects);
        projects.value = appendToCurrentResults
          ? projects.value.concat(res.data.projects)
          : res.data.projects;
        totalResultsCount.value = res.data?.metadata?.count || 0;
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
  searchProjects({
    searchIndex,
    appendToCurrentResults: false,
    logQuery: true,
  });
};

const onOpen = () => {
  // if (props.populatedResult) {
  //   datasets.value = [props.populatedResult]
  // }
  //
  // // selectedResult.value = null
  // emit('update:populatedResult', null)
  emit("open");
};

const onClose = () => {
  emit("close");
};

const onClear = () => {
  console.log("onClear invoked");
  emit("clear");
  // emit('update:populatedResult', null)
};

watch([searchTerm], (newVal, oldVal) => {
  console.log("searchTerm or filterQuery changed");
  console.log("searchTerm new Val:", newVal[0]);
  console.log("searchTerm new Val:", oldVal[0]);

  searchIndex.value += 1;
  searches.value.push(searchIndex.value);

  loading.value = true;

  debouncedSearch.value = _.debounce(performSearch, 300);
  debouncedSearch.value(searchIndex.value);
});

// watch(
//   () => props.populatedResult,
//   (newVal, oldVal) => {
//     console.log('populatedResult changed')
//     console.log(`oldVal:`, oldVal)
//     console.log(`newVal:`, newVal)
//   }
// )

// watch(datasets, () => {
//   console.log('datasets changed')
//   console.log(`datasets:`, datasets.value)
// })

onMounted(() => {
  loading.value = true;
  console.log("onMounted invoked");
  searchProjects();
});

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel();
  }
});
</script>

<style scoped></style>
