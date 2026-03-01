<route lang="yaml">
meta:
  title: Groups
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- Page header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Groups</h1>
        <p class="text-sm mt-1" style="color: var(--va-secondary)">
          Browse and manage organizational groups.
        </p>
      </div>
      <!-- Create Group — platform admin only -->
      <VaButton
        v-if="auth.canAdmin"
        preset="primary"
        icon="add"
        @click="showCreateModal = true"
      >
        Create Group
      </VaButton>
    </div>

    <!-- ── Filters ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search input -->
      <VaInput
        v-model="searchTerm"
        placeholder="Search groups…"
        clearable
        class="w-full sm:w-64"
        @update:model-value="debouncedFetch"
      >
        <template #prepend>
          <i-mdi-magnify class="text-lg" style="color: var(--va-secondary)" />
        </template>
      </VaInput>

      <!-- Scope filter chips -->
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

      <!-- Archived toggle -->
      <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
        <VaSwitch v-model="showArchived" size="small" @update:model-value="fetchGroups" />
        Show archived
      </label>
    </div>

    <!-- ── Results ──────────────────────────────────────────────────── -->

    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <VaSkeleton v-for="n in 6" :key="n" variant="rounded" height="96px" />
    </div>

    <!-- Error -->
    <VaAlert v-else-if="error" color="danger" icon="mdi-alert-circle-outline">
      Failed to load groups. {{ error.message }}
    </VaAlert>

    <!-- Empty state -->
    <VaCard v-else-if="groups.length === 0">
      <VaCardContent>
        <div class="flex flex-col items-center py-10 gap-2 text-center">
          <i-mdi-account-group-outline class="text-5xl text-gray-300 dark:text-gray-600" />
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">No groups found.</p>
          <p class="text-xs" style="color: var(--va-secondary)">
            Try adjusting your search or filters.
          </p>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Group cards grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <GroupCard
        v-for="group in groups"
        :key="group.id"
        :group="group"
        :authority-label="callerAuthorityLabel(group)"
      />
    </div>

    <!-- Pagination -->
    <div v-if="total > limit" class="flex justify-center mt-2">
      <VaPagination
        v-model="currentPage"
        :pages="totalPages"
        @update:model-value="fetchGroups"
      />
    </div>
  </div>

  <!-- ── Create Group Modal ─────────────────────────────────────────── -->
  <VaModal
    v-model="showCreateModal"
    title="Create Group"
    ok-text="Create"
    cancel-text="Cancel"
    :ok-disabled="!createForm.name.trim()"
    :loading="createLoading"
    @ok="handleCreate"
  >
    <div class="flex flex-col gap-4">
      <VaInput
        v-model="createForm.name"
        label="Group Name"
        placeholder="e.g. Research Lab Alpha"
        required
      />
      <VaTextarea
        v-model="createForm.description"
        label="Description"
        placeholder="Short description of this group's purpose (optional)"
        rows="3"
      />
    </div>
  </VaModal>
</template>

<script setup>
import GroupService from '@/services/v2/groups'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vuestic-ui'

const auth = useAuthStore()
const router = useRouter()
const { init: toast } = useToast()

// ── State ─────────────────────────────────────────────────────────────────
const searchTerm = ref('')
const showArchived = ref(false)
const activeScope = ref('mine') // 'mine' | 'admin' | 'all'
const loading = ref(false)
const error = ref(null)
const groups = ref([])
const total = ref(0)
const limit = 24
const currentPage = ref(1)
const totalPages = computed(() => Math.ceil(total.value / limit))

const scopeFilters = computed(() => {
  const filters = [
    { label: 'My Groups', value: 'mine' },
    { label: 'Admin Groups', value: 'admin' },
  ]
  if (auth.canAdmin) {
    filters.push({ label: 'All', value: 'all' })
  }
  return filters
})

// ── Fetch ─────────────────────────────────────────────────────────────────
async function fetchGroups() {
  loading.value = true
  error.value = null
  try {
    const params = {
      search_term: searchTerm.value.trim(),
      limit,
      offset: (currentPage.value - 1) * limit,
      is_archived: showArchived.value ? undefined : false,
    }
    if (activeScope.value === 'mine') {
      params.direct_membership_only = true
    } else if (activeScope.value === 'admin') {
      // oversight_only=false means direct admin only; we want admin groups
      // For admin groups we rely on the platform returning only groups where
      // the caller is a direct admin. No special param currently — fall through
      params.direct_membership_only = false
    }
    // 'all' scope: no filtering, platform admin sees everything
    const { data: { metadata, data: items } } = await GroupService.search(params)
    groups.value = items
    total.value = metadata.total
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

const debouncedFetch = useDebounceFn(() => {
  currentPage.value = 1
  fetchGroups()
}, 350)

function setScope(scope) {
  activeScope.value = scope
  currentPage.value = 1
  fetchGroups()
}

// ── Authority label helper ────────────────────────────────────────────────
function callerAuthorityLabel(group) {
  if (auth.canAdmin) return 'Platform Admin'
  if (group.caller_role === 'ADMIN') return 'Admin'
  if (group.caller_role === 'OVERSIGHT') return 'Oversight'
  if (group.caller_role === 'MEMBER') return 'Member'
  return null
}

// ── Create Group ──────────────────────────────────────────────────────────
const showCreateModal = ref(false)
const createLoading = ref(false)
const createForm = reactive({ name: '', description: '' })

async function handleCreate() {
  if (!createForm.name.trim()) return
  createLoading.value = true
  try {
    await GroupService.create({
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
    })
    toast({ message: `Group "${createForm.name}" created.`, color: 'success', position: 'bottom-right' })
    showCreateModal.value = false
    createForm.name = ''
    createForm.description = ''
    fetchGroups()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to create group.', color: 'danger', position: 'bottom-right' })
  } finally {
    createLoading.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  // Default scope: platform admins see all, others see mine
  activeScope.value = auth.canAdmin ? 'all' : 'mine'
  fetchGroups()
})
</script>
