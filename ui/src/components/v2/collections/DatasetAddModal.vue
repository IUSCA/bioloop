<template>
  <VaModal
    :model-value="props.modelValue"
    title="Add Dataset to Collection"
    size="medium"
    ok-text="Add Dataset"
    cancel-text="Cancel"
    :ok-disabled="!selectedDataset"
    :loading="props.loading"
    @update:model-value="emit('update:modelValue', $event)"
    @ok="handleConfirm"
    @cancel="emit('update:modelValue', false)"
  >
    <div class="flex flex-col gap-4">
      <!-- Search -->
      <VaInput
        v-model="searchQuery"
        placeholder="Search datasets…"
        clearable
        @update:model-value="debouncedSearch"
      >
        <template #prepend>
          <i-mdi-magnify class="text-lg" style="color: var(--va-secondary)" />
        </template>
      </VaInput>

      <!-- Results list -->
      <div class="max-h-52 overflow-y-auto flex flex-col gap-1">
        <div v-if="searching" class="flex items-center justify-center py-6">
          <VaProgressCircle indeterminate size="28" />
        </div>

        <div
          v-else-if="searchQuery.trim().length > 0 && results.length === 0"
          class="flex flex-col items-center py-4 text-center gap-1"
        >
          <i-mdi-database-off-outline class="text-3xl text-gray-300 dark:text-gray-600" />
          <p class="text-sm" style="color: var(--va-secondary)">No datasets found.</p>
        </div>

        <button
          v-for="ds in results"
          :key="ds.id"
          type="button"
          class="flex items-start gap-3 px-3 py-2 rounded text-left text-sm w-full transition-colors"
          :class="
            selectedDataset?.id === ds.id
              ? 'bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-300 dark:border-blue-700'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
          "
          @click="selectedDataset = ds"
        >
          <i-mdi-database-outline class="text-xl shrink-0 mt-0.5" style="color: var(--va-secondary)" />
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ ds.name }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <VaChip v-if="ds.type" color="info" size="small">{{ ds.type }}</VaChip>
              <span class="text-xs" style="color: var(--va-secondary)">
                {{ ds.owner_group?.name ?? '' }}
              </span>
            </div>
          </div>
        </button>
      </div>

      <!-- Access impact notice -->
      <div
        v-if="selectedDataset"
        class="flex items-start gap-3 rounded-lg px-4 py-3 border border-solid border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"
      >
        <i-mdi-alert-outline class="text-xl shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div>
          <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">Access Impact</p>
          <p class="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
            Adding <strong>{{ selectedDataset.name }}</strong> to this collection will grant
            access to it for all subjects who hold a grant on this collection.
            Make sure this is intentional.
          </p>
        </div>
      </div>
    </div>
  </VaModal>
</template>

<script setup>
import DatasetService from '@/services/v2/datasets'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  loading: { type: Boolean, default: false },
  /** Dataset IDs already in this collection — excluded from results */
  existingDatasetIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'add'])

const searchQuery = ref('')
const results = ref([])
const searching = ref(false)
const selectedDataset = ref(null)

const debouncedSearch = useDebounceFn(async (query) => {
  if (!query?.trim()) { results.value = []; return }
  searching.value = true
  try {
    const { data } = await DatasetService.list({ search: query.trim(), limit: 20 })
    const list = Array.isArray(data) ? data : (data.datasets ?? data.results ?? [])
    // Exclude already-added datasets
    results.value = list.filter((d) => !props.existingDatasetIds.includes(d.id))
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}, 400)

function handleConfirm() {
  if (selectedDataset.value) emit('add', selectedDataset.value)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      searchQuery.value = ''
      results.value = []
      selectedDataset.value = null
    }
  },
)
</script>
