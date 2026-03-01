<template>
  <div class="flex flex-col gap-4">
    <!-- Filters -->
    <div v-if="props.showFilters" class="flex flex-wrap gap-3 items-end">
      <VaSelect
        v-model="filters.resource_type"
        label="Resource Type"
        :options="['DATASET', 'COLLECTION']"
        clearable
        class="w-40"
        @update:model-value="refresh"
      />
      <VaSelect
        v-model="filters.subject_type"
        label="Subject Type"
        :options="['USER', 'GROUP']"
        clearable
        class="w-40"
        @update:model-value="refresh"
      />
      <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none self-end pb-1">
        <VaSwitch v-model="filters.expiring_soon" size="small" @update:model-value="refresh" />
        Expiring soon
      </label>
      <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none self-end pb-1">
        <VaSwitch v-model="filters.active_only" size="small" @update:model-value="refresh" />
        Active only
      </label>
    </div>

    <!-- Using GrantTable (local import by full path) -->
    <GrantTable
      :grants="grants"
      :loading="loading"
      :can-revoke="props.canRevoke"
      :show-resource="true"
      @revoke="handleRevoke"
    />

    <!-- Pagination -->
    <div v-if="total > pageSize" class="flex justify-center">
      <VaPagination v-model="currentPage" :pages="totalPages" @update:model-value="refresh" />
    </div>
  </div>
</template>

<script setup>
import GrantTable from '@/components/v2/collections/GrantTable.vue'
import GrantService from '@/services/v2/grants'
import { useToast } from 'vuestic-ui'

const props = defineProps({
  /** Fixed filters — merged with UI filters */
  fixedFilters: { type: Object, default: () => ({}) },
  canRevoke: { type: Boolean, default: false },
  showFilters: { type: Boolean, default: true },
})

const emit = defineEmits(['revoked'])
const { init: toast } = useToast()

const pageSize = 20
const currentPage = ref(1)
const total = ref(0)
const totalPages = computed(() => Math.ceil(total.value / pageSize))

const grants = ref([])
const loading = ref(false)

const filters = reactive({
  resource_type: null,
  subject_type: null,
  expiring_soon: false,
  active_only: true,
})

async function refresh() {
  loading.value = true
  try {
    const params = {
      ...props.fixedFilters,
      limit: pageSize,
      offset: (currentPage.value - 1) * pageSize,
      ...(filters.resource_type && { resource_type: filters.resource_type }),
      ...(filters.subject_type && { subject_type: filters.subject_type }),
      ...(filters.expiring_soon && { expiring_soon: true }),
      ...(filters.active_only && { active_only: true }),
    }
    const { data: { metadata, data: items } } = await GrantService.list(params)
    grants.value = items
    total.value = metadata.total
  } catch {
    grants.value = []
  } finally {
    loading.value = false
  }
}

async function handleRevoke(grant) {
  try {
    await GrantService.revoke(grant.id)
    toast({ message: 'Grant revoked.', color: 'success', position: 'bottom-right' })
    emit('revoked', grant)
    refresh()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to revoke grant.', color: 'danger', position: 'bottom-right' })
  }
}

onMounted(refresh)

// Allow parent to trigger refresh
defineExpose({ refresh })
</script>
