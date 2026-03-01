<template>
  <div>
    <!-- Table -->
    <VaDataTable
      :items="props.members"
      :columns="columns"
      :loading="props.loading"
      hoverable
      striped
    >
      <!-- Name column -->
      <template #cell(name)="{ row }">
        <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
          {{ row.rowData.user?.name ?? row.rowData.user?.username ?? '—' }}
        </span>
      </template>

      <!-- Username column -->
      <template #cell(username)="{ row }">
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ row.rowData.user?.username }}</span>
      </template>

      <!-- Role / authority badge column -->
      <template #cell(role)="{ row }">
        <VaChip
          :color="roleColor(row.rowData)"
          size="small"
        >
          {{ roleLabel(row.rowData) }}
        </VaChip>
      </template>

      <!-- Actions column -->
      <template #cell(actions)="{ row }">
        <div v-if="props.canMutate && !props.oversightOnly" class="flex items-center gap-1">
          <VaButton
            v-if="row.rowData.role !== 'ADMIN'"
            preset="plain"
            color="danger"
            size="small"
            icon="person_remove"
            :title="`Remove ${row.rowData.user?.username} from group`"
            :loading="removingId === row.rowData.user?.id"
            @click="handleRemove(row.rowData)"
          />
        </div>
      </template>
    </VaDataTable>

    <!-- Empty state -->
    <div
      v-if="!props.loading && props.members.length === 0"
      class="flex flex-col items-center py-8 gap-2 text-center"
    >
      <i-mdi-account-multiple-outline class="text-4xl text-gray-300 dark:text-gray-600" />
      <p class="text-sm" style="color: var(--va-secondary)">No members found.</p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  /** Array of member objects from the API. */
  members: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** When true, show mutation controls (remove button). */
  canMutate: { type: Boolean, default: false },
  /** When true, disable all mutations (oversight-only view). */
  oversightOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])

const removingId = ref(null)

const columns = computed(() => {
  const base = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'username', label: 'Username', sortable: true },
    { key: 'role', label: 'Role' },
  ]
  if (props.canMutate && !props.oversightOnly) {
    base.push({ key: 'actions', label: '' })
  }
  return base
})

function roleLabel(member) {
  if (member.role === 'ADMIN') return 'Admin'
  return 'Member'
}

function roleColor(member) {
  if (member.role === 'ADMIN') return 'primary'
  return 'secondary'
}

async function handleRemove(member) {
  removingId.value = member.user?.id
  try {
    emit('remove', member)
  } finally {
    removingId.value = null
  }
}
</script>
