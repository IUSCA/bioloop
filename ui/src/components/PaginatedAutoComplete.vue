<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    :async="true"
    :paginated="true"
    :paginated-total-results-count="totalResultsCount"
    :data="searchResults"
    :display-by="'name'"
    @clear="onClear"
    @open-="onOpen"
    @load-more="loadNextPage"
    placeholder="Search Datasets by name"
    @select="onSelect"
    :disabled="props.disabled"
    :label="'Paginated AutoComplete Demo'"
  />
</template>

<script setup>
const props = defineProps({
  selected: {
    type: [String, Object],
  },
  displayBy: {
    type: [Function, String],
    default: () => 'name' || 'name',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
  },
})

const emit = defineEmits([
  // 'clear', 'open', 'close',
  'update:selected',
])

const PAGE_SIZE = 10
const loading = ref(false)
const searchResults = ref([])
const totalResultsCount = ref(0)
const page = ref(1)
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1)
})

const searchTerm = ref('')

const loadResults = async ({ appendToCurrentResult = true } = {}) => {
  if (!searchTerm.value) return []

  loading.value = true

  try {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Mock API response
    const mockApiResponse = {
      results: Array.from({ length: PAGE_SIZE }, (_, i) => ({
        name: `Result ${skip.value + i + 1} for "${searchTerm.value}"`,
      })),
      totalCount: 100, // Assuming there are always 100 total results for any search
    }

    searchResults.value = appendToCurrentResult
      ? [...searchResults.value, ...mockApiResponse.results]
      : mockApiResponse.results
    totalResultsCount.value = mockApiResponse.totalCount
  } catch (error) {
    console.error('Error fetching results:', error)
    searchResults.value = []
    totalResultsCount.value = 0
  } finally {
    loading.value = false
  }
}

const displayedResult = (item) => {
  return typeof props.displayBy === 'function' ? props.displayBy(item) : item[props.displayBy]
}

const onSelect = (item) => {
  searchTerm.value = displayedResult(item)
  emit('update:selected', item)
}

const loadNextPage = async () => {
  page.value += 1 // increase page value for offset recalculation
  return await loadResults()
}

const onOpen = () => {
  searchTerm.value = props.selected ? displayedResult(props.selected) : ''
}

const onClear = () => {
  searchTerm.value = ''
}

watch(searchTerm, () => {
  page.value = 1 // reset page value when search term changes
  loadResults({ appendToCurrentResult: false })
})

onMounted(() => {
  loadResults()
})
</script>

<style scoped></style>
