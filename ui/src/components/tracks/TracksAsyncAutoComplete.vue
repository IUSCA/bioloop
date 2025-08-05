<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    :async="true"
    :paginated="true"
    :paginated-total-results-count="totalResultsCount"
    :data="tracks"
    :display-by="'name'"
    @clear="onClear"
    @load-more="loadNextPage"
    placeholder="Search Tracks by name"
    :loading="loading"
    @select="onSelect"
    @open="onOpen"
    @close="onClose"
    :disabled="props.disabled"
    :label="props.label"
  />
</template>

<script setup>
import toast from '@/services/toast';
import { useTracksStore } from '@/stores/tracks';
import _ from 'lodash';

const PAGE_SIZE = 10;

const props = defineProps({
  selected: {
    type: [String, Object],
  },
  searchTerm: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
  },
  error: {
    type: String,
  },
  errorMessages: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  'clear',
  'open',
  'close',
  'update:selected',
  'update:searchTerm',
]);

const tracksStore = useTracksStore();

const loading = ref(false);
const tracks = ref([]);
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
    emit('update:searchTerm', val);
  },
});

const debouncedSearch = ref(null);
const searchIndex = ref(0);
const searches = ref([]);
const latestQuery = ref(null);

const onSelect = (item) => {
  emit('update:searchTerm', item.name);
  emit('update:selected', item);
};

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return searchTracks({ appendToCurrentResults: true });
};

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { name: searchTerm.value }),
    ...batchingQuery.value,
  };
});

const queryTracks = ({ queryIndex = null, query = null } = {}) => {
  return tracksStore.fetchTracks(query).then((res) => {
    return { data: res, ...(queryIndex && { queryIndex }) };
  });
};

const searchTracks = ({
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

    return queryTracks({
      ...(searchIndex && { queryIndex: searchIndex }),
      query: fetchQuery.value,
    })
      .then((res) => {
        tracks.value = appendToCurrentResults
          ? tracks.value.concat(res.data.tracks)
          : res.data.tracks;
        totalResultsCount.value = res.data.metadata.count;
        resolveSearch(res.queryIndex);
      })
      .catch((e) => {
        console.error(e);
        toast.error('Failed to load tracks');
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
  searchTracks({
    searchIndex,
    appendToCurrentResults: false,
    logQuery: true,
  });
};

const onOpen = () => {
  emit('open');
};

const onClose = () => {
  emit('close');
};

const onClear = () => {
  emit('clear');
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
  searchTracks();
});

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel();
  }
});
</script>

<style scoped></style> 