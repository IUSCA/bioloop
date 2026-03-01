<route lang="yaml">
meta:
  title: Collections
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- Page header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Collections</h1>
        <p class="text-sm mt-1" style="color: var(--va-secondary)">
          Authorization containers — grants on a collection apply to all datasets within it.
        </p>
      </div>
      <!-- Create Collection — group admin / platform admin -->
      <VaButton
        v-if="auth.canOperate"
        preset="primary"
        icon="add"
        @click="showCreateModal = true"
      >
        Create Collection
      </VaButton>
    </div>

    <!-- ── Filters ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3">
      <VaInput
        v-model="searchTerm"
        placeholder="Search collections…"
        clearable
        class="w-full sm:w-64"
        @update:model-value="debouncedFetch"
      >
        <template #prepend>
          <i-mdi-magnify class="text-lg" style="color: var(--va-secondary)" />
        </template>
      </VaInput>

      <div class="flex items-center gap-2">
        <VaChip
          v-for="f in scopeFilters"
          :key="f.value"
          :color="activeScope === f.value ? 'primary' : 'secondary'"
          class="cursor-pointer"
          @click="setScope(f.value)"
        >
          {{ f.label }}
        </VaChip>
      </div>

      <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
        <VaSwitch v-model="showArchived" size="small" @update:model-value="fetchCollections" />
        Show archived
      </label>
    </div>

    <!-- ── Results ──────────────────────────────────────────────────── -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <VaSkeleton v-for="n in 6" :key="n" variant="rounded" height="88px" />
    </div>

    <VaAlert v-else-if="error" color="danger" icon="mdi-alert-circle-outline">
      Failed to load collections. {{ error.message }}
    </VaAlert>

    <VaCard v-else-if="collections.length === 0">
      <VaCardContent>
        <div class="flex flex-col items-center py-10 gap-2 text-center">
          <i-mdi-folder-multiple-outline class="text-5xl text-gray-300 dark:text-gray-600" />
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">No collections found.</p>
          <p class="text-xs" style="color: var(--va-secondary)">Try adjusting your search or filters.</p>
        </div>
      </VaCardContent>
    </VaCard>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <CollectionCard v-for="col in collections" :key="col.id" :collection="col" />
    </div>

    <!-- Pagination -->
    <div v-if="total > limit" class="flex justify-center mt-2">
      <VaPagination v-model="currentPage" :pages="totalPages" @update:model-value="fetchCollections" />
    </div>
  </div>

  <!-- ── Create Collection Modal ────────────────────────────────────── -->
  <VaModal
    v-model="showCreateModal"
    title="Create Collection"
    ok-text="Create"
    cancel-text="Cancel"
    :ok-disabled="!createForm.name.trim() || !createForm.owner_group_id"
    :loading="createLoading"
    @ok="handleCreate"
  >
    <div class="flex flex-col gap-4">
      <VaInput v-model="createForm.name" label="Collection Name" required />
      <VaTextarea v-model="createForm.description" label="Description" rows="3" />
      <VaInput
        v-model="createForm.owner_group_id"
        label="Owner Group ID"
        placeholder="Group UUID"
        required
      />
    </div>
  </VaModal>
</template>

<script setup>
import CollectionService from '@/services/v2/collections'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vuestic-ui'

const auth = useAuthStore()
const { init: toast } = useToast()

const searchTerm = ref('')
const showArchived = ref(false)
const activeScope = ref('visible')
const loading = ref(false)
const error = ref(null)
const collections = ref([])
const total = ref(0)
const limit = 24
const currentPage = ref(1)
const totalPages = computed(() => Math.ceil(total.value / limit))

const scopeFilters = computed(() => {
  const filters = [{ label: 'Visible to Me', value: 'visible' }]
  if (auth.canOperate) filters.push({ label: 'My Groups', value: 'mine' })
  if (auth.canAdmin) filters.push({ label: 'All', value: 'all' })
  return filters
})

async function fetchCollections() {
  loading.value = true
  error.value = null
  try {
    const params = {
      search_term: searchTerm.value.trim(),
      limit,
      offset: (currentPage.value - 1) * limit,
      ...(showArchived.value ? {} : { is_archived: false }),
    }
    const { data: { metadata, data: items } } = await CollectionService.search(params)
    collections.value = items
    total.value = metadata.total
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

const debouncedFetch = useDebounceFn(() => {
  currentPage.value = 1
  fetchCollections()
}, 350)

function setScope(scope) {
  activeScope.value = scope
  currentPage.value = 1
  fetchCollections()
}

// Create
const showCreateModal = ref(false)
const createLoading = ref(false)
const createForm = reactive({ name: '', description: '', owner_group_id: '' })

async function handleCreate() {
  createLoading.value = true
  try {
    await CollectionService.create({
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
      owner_group_id: createForm.owner_group_id.trim(),
    })
    toast({ message: `Collection "${createForm.name}" created.`, color: 'success', position: 'bottom-right' })
    showCreateModal.value = false
    Object.assign(createForm, { name: '', description: '', owner_group_id: '' })
    fetchCollections()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to create collection.', color: 'danger', position: 'bottom-right' })
  } finally {
    createLoading.value = false
  }
}

onMounted(fetchCollections)
</script>
