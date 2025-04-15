<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    v-model:populated-result="populatedResult"
    :async="true"
    :paginated="true"
    :data="datasets"
    :display-by="'name'"
    @clear="onClear"
    @load-more="loadNextPage"
    placeholder="Search Datasets by name"
    :loading="loading"
    @select="onSelect"
    @open="onOpen"
    :disabled="props.disabled"
  />
</template>

<script setup>
import datasetService from '@/services/dataset'
import toast from '@/services/toast'
import _ from 'lodash'

const NAME_TRIM_THRESHOLD = 35
const PAGE_SIZE = 10

const props = defineProps({
  populatedResult: {
    type: Object,
  },
  datasetType: {
    type: String,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
  },
  errorMessages: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['select', 'clear', 'update:populatedResult'])

const loading = ref(false)
const datasets = ref([])
const totalResultCount = ref(0)
const page = ref(1)
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1)
})
const selectedResult = ref(null)
const searchTerm = computed({
  get: () => {
    return props.populatedResult
      ? props.populatedResult['name']
      : selectedResult.value
        ? selectedResult.value['name']
        : ''
  },
  set: () => {},
})

// const searchTerm = ref('')

const debouncedSearch = ref(null)
const searchIndex = ref(0)
const searches = ref([])
const latestQuery = ref(null)
const checkboxes = ref({
  rawData: false,
  dataProduct: false,
})
const populatedResult = computed({
  get: () => {
    return selectedResult.value || props.populatedResult
  },
  set: (val) => {
    emit('update:populatedResult', val)
  },
})

watch(
  () => props.populatedResult,
  (newVal, oldVal) => {
    console.log('selectAutoComplete watch on populatedResult change')
    console.log('newVal:', newVal)
    console.log('oldVal:', oldVal)
  }
)

const activeCountText = computed(() => {
  const activeCount = Object.values(checkboxes.value).filter((val) => !!val).length
  return activeCount > 0 ? ` (${activeCount})` : ''
})

const onSelect = (item) => {
  selectedResult.value = item
  emit('select', item)
}

const loadNextPage = () => {
  // console.log('loadNextPage')
  // console.log('searchTerm:', searchTerm.value)
  page.value += 1 // increase page value for offset recalculation
  return searchDatasets({ appendToCurrentResults: true })
}

// todo - move to utils
const trimName = (val) =>
  val.length > NAME_TRIM_THRESHOLD ? val.substring(0, NAME_TRIM_THRESHOLD) + '...' : val

const filterQuery = computed(() => {
  let query
  if (props.datasetType) {
    query = {
      type: props.datasetType,
    }
  } else {
    query = {
      type: undefined,
    }
  }

  return { ...query, deleted: props.fetchInactive }
})

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  }
})

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { name: searchTerm.value }),
    ...filterQuery.value,
    ...batchingQuery.value,
  }
})

const queryDatasets = ({ queryIndex = null, query = null } = {}) => {
  return datasetService.getAll(query).then((res) => {
    return { data: res.data, ...(queryIndex && { queryIndex }) }
  })
}

const searchDatasets = ({
  searchIndex = null,
  appendToCurrentResults = false,
  logQuery = false,
} = {}) => {
  // Ensure that the same query is not being run a second time (which
  // is possible due to debounced searches). If it is, the search
  // can be resolved immediately.
  if (_.isEqual(latestQuery.value, fetchQuery.value)) {
    resolveSearch(searchIndex)
  } else {
    if (logQuery) {
      latestQuery.value = fetchQuery.value
    }

    return queryDatasets({
      ...(searchIndex && { queryIndex: searchIndex }),
      query: fetchQuery.value,
    })
      .then((res) => {
        datasets.value = appendToCurrentResults
          ? datasets.value.concat(res.data.datasets)
          : res.data.datasets
        totalResultCount.value = res.data.metadata.count
        resolveSearch(res.queryIndex)
      })
      .catch((e) => {
        console.error(e)
        toast.error('Failed to load datasets')
      })
  }
}

const resolveSearch = (searchIndex) => {
  searches.value.splice(searches.value.indexOf(searchIndex), 1)
  if (searches.value.length === 0) {
    loading.value = false
  }
}

const performSearch = (searchIndex) => {
  // reset page value
  page.value = 1
  // load search results
  searchDatasets({
    searchIndex,
    appendToCurrentResults: false,
    logQuery: true,
  })
}

const onOpen = () => {
  if (props.populatedResult) {
    datasets.value = [props.populatedResult]
  }

  selectedResult.value = null
  emit('update:populatedResult', null)
}

const onClear = () => {
  emit('clear')
}

watch([searchTerm, filterQuery], () => {
  searchIndex.value += 1
  searches.value.push(searchIndex.value)

  loading.value = true

  debouncedSearch.value = _.debounce(performSearch, 300)
  debouncedSearch.value(searchIndex.value)
})

// watch(datasets, () => {
//   console.log('datasets changed')
//   console.log(`datasets:`, datasets.value)
// })

onMounted(() => {
  loading.value = true
  searchDatasets()
})

onBeforeUnmount(() => {
  if (debouncedSearch.value) {
    debouncedSearch.value.cancel()
  }
})
</script>

<style scoped></style>
