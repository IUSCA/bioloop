<template>
  <!-- Stateless card — parent drives actions -->
  <VaCard class="border" :class="statusBorderClass">
    <VaCardContent>
      <div class="flex flex-col gap-3">
        <!-- Header row: resource + status chip -->
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <i-mdi-database-outline
              v-if="props.request.resource_type === 'DATASET'"
              class="text-xl shrink-0"
              style="color: var(--va-primary)"
            />
            <i-mdi-folder-multiple-outline
              v-else
              class="text-xl shrink-0"
              style="color: var(--va-primary)"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {{ props.request.resource?.name ?? props.request.resource_id }}
              </p>
              <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                {{ props.request.resource_type }}
              </p>
            </div>
          </div>
          <VaChip :color="statusColor" size="small" class="shrink-0">
            {{ props.request.status?.replace('_', ' ') ?? '—' }}
          </VaChip>
        </div>

        <!-- Purpose -->
        <p v-if="props.request.purpose" class="text-xs text-gray-600 dark:text-gray-400 italic">
          "{{ props.request.purpose }}"
        </p>

        <!-- Dates -->
        <div class="flex flex-wrap gap-4 text-xs" style="color: var(--va-secondary)">
          <span v-if="props.request.created_at">
            Submitted {{ new Date(props.request.created_at).toLocaleDateString() }}
          </span>
          <span v-if="props.request.reviewed_at">
            Reviewed {{ new Date(props.request.reviewed_at).toLocaleDateString() }}
          </span>
        </div>

        <!-- Withdraw button (only for UNDER_REVIEW requests) -->
        <div v-if="props.request.status === 'UNDER_REVIEW' && props.canWithdraw" class="flex justify-end">
          <VaButton
            preset="plain"
            color="secondary"
            size="small"
            icon="close"
            :loading="props.withdrawing"
            @click="emit('withdraw', props.request)"
          >
            Withdraw
          </VaButton>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const props = defineProps({
  request: { type: Object, required: true },
  canWithdraw: { type: Boolean, default: true },
  withdrawing: { type: Boolean, default: false },
})

const emit = defineEmits(['withdraw'])

const STATUS_COLORS = {
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'secondary',
  DRAFT: 'info',
}

const STATUS_BORDER = {
  UNDER_REVIEW: 'border-amber-300 dark:border-amber-700',
  APPROVED: 'border-green-300 dark:border-green-700',
  REJECTED: 'border-red-300 dark:border-red-700',
  EXPIRED: 'border-gray-300 dark:border-gray-700',
  DRAFT: 'border-blue-200 dark:border-blue-800',
}

const statusColor = computed(() => STATUS_COLORS[props.request.status] ?? 'secondary')
const statusBorderClass = computed(() => STATUS_BORDER[props.request.status] ?? 'border-gray-200 dark:border-gray-700')
</script>
