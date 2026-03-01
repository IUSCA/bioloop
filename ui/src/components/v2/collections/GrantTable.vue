<template>
  <div>
    <VaDataTable
      :items="props.grants"
      :columns="columns"
      :loading="props.loading"
      hoverable
      striped
    >
      <!-- Subject column -->
      <template #cell(subject)="{ row }">
        <div class="flex items-center gap-1 text-sm">
          <i-mdi-account-outline
            v-if="row.rowData.subject_type === 'USER'"
            class="text-base shrink-0"
            style="color: var(--va-secondary)"
          />
          <i-mdi-account-group-outline
            v-else
            class="text-base shrink-0"
            style="color: var(--va-secondary)"
          />
          <span class="text-gray-800 dark:text-gray-200">
            {{ row.rowData.subject?.name ?? row.rowData.subject?.username ?? row.rowData.subject_id }}
          </span>
          <VaChip color="secondary" size="small" class="ml-1">
            {{ row.rowData.subject_type }}
          </VaChip>
        </div>
      </template>

      <!-- Access type column -->
      <template #cell(access_type)="{ row }">
        <VaChip color="info" size="small">
          {{ row.rowData.access_type?.name ?? row.rowData.access_type_id ?? '—' }}
        </VaChip>
      </template>

      <!-- Expiry column -->
      <template #cell(valid_until)="{ row }">
        <span
          class="text-sm"
          :class="isExpiringSoon(row.rowData.valid_until) ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-600 dark:text-gray-400'"
        >
          {{ row.rowData.valid_until ? new Date(row.rowData.valid_until).toLocaleDateString() : 'No expiry' }}
          <span v-if="isExpiringSoon(row.rowData.valid_until)" class="ml-1 text-xs">(soon)</span>
        </span>
      </template>

      <!-- Status column -->
      <template #cell(status)="{ row }">
        <VaChip
          :color="row.rowData.revoked_at ? 'danger' : 'success'"
          size="small"
        >
          {{ row.rowData.revoked_at ? 'Revoked' : 'Active' }}
        </VaChip>
      </template>

      <!-- Actions column -->
      <template #cell(actions)="{ row }">
        <VaButton
          v-if="props.canRevoke && !row.rowData.revoked_at"
          preset="plain"
          color="danger"
          size="small"
          icon="do_disturb"
          :loading="revokingId === row.rowData.id"
          title="Revoke grant"
          @click="handleRevoke(row.rowData)"
        />
      </template>
    </VaDataTable>

    <!-- Empty state -->
    <div
      v-if="!props.loading && props.grants.length === 0"
      class="flex flex-col items-center py-8 gap-2 text-center"
    >
      <i-mdi-key-outline class="text-4xl text-gray-300 dark:text-gray-600" />
      <p class="text-sm" style="color: var(--va-secondary)">No grants found.</p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  grants: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  canRevoke: { type: Boolean, default: false },
  /** When true shows resource name column (for grant explorer context) */
  showResource: { type: Boolean, default: false },
})

const emit = defineEmits(['revoke'])

const revokingId = ref(null)

const columns = computed(() => {
  const cols = [
    { key: 'subject', label: 'Subject' },
    { key: 'access_type', label: 'Access Type' },
    { key: 'valid_until', label: 'Valid Until', sortable: true },
    { key: 'status', label: 'Status' },
  ]
  if (props.showResource) {
    cols.splice(1, 0, { key: 'resource', label: 'Resource' })
  }
  if (props.canRevoke) {
    cols.push({ key: 'actions', label: '' })
  }
  return cols
})

function isExpiringSoon(validUntil) {
  if (!validUntil) return false
  const delta = new Date(validUntil) - new Date()
  return delta > 0 && delta < 30 * 24 * 60 * 60 * 1000
}

async function handleRevoke(grant) {
  revokingId.value = grant.id
  try {
    emit('revoke', grant)
  } finally {
    revokingId.value = null
  }
}
</script>
