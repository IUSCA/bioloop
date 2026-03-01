<template>
  <div class="flex flex-col gap-4">
    <!-- Loading -->
    <div v-if="props.loading" class="flex flex-col gap-3">
      <VaSkeleton v-for="n in 3" :key="n" variant="rounded" height="140px" />
    </div>

    <!-- Empty -->
    <VaCard v-else-if="props.requests.length === 0">
      <VaCardContent>
        <div class="flex flex-col items-center py-8 gap-2 text-center">
          <i-mdi-inbox-outline class="text-4xl text-gray-300 dark:text-gray-600" />
          <p class="text-sm" style="color: var(--va-secondary)">No pending requests to review.</p>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Request cards -->
    <VaCard
      v-for="req in props.requests"
      :key="req.id"
      class="border border-solid border-amber-200 dark:border-amber-800"
    >
      <VaCardContent>
        <div class="flex flex-col gap-3">
          <!-- Resource info -->
          <div class="flex items-center gap-2">
            <i-mdi-database-outline
              v-if="req.resource_type === 'DATASET'"
              class="text-lg shrink-0"
              style="color: var(--va-primary)"
            />
            <i-mdi-folder-multiple-outline
              v-else
              class="text-lg shrink-0"
              style="color: var(--va-primary)"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {{ req.resource?.name ?? req.resource_id }} ({{ req.resource_type }})
              </p>
              <p class="text-xs" style="color: var(--va-secondary)">
                Requested by <strong>{{ req.requester?.username ?? req.requester_id }}</strong>
                · {{ new Date(req.created_at).toLocaleDateString() }}
              </p>
            </div>
          </div>

          <!-- Purpose -->
          <p v-if="req.purpose" class="text-xs italic text-gray-600 dark:text-gray-400">
            "{{ req.purpose }}"
          </p>

          <!-- Review form -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-3 flex flex-col gap-3">
            <!-- Per-item decisions -->
            <div
              v-for="item in getReviewState(req.id).items"
              :key="item.id"
              class="flex items-center gap-3 flex-wrap"
            >
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[100px] truncate">
                {{ item.label ?? item.id }}
              </span>
              <div class="flex gap-2">
                <VaChip
                  :color="item.decision === 'APPROVED' ? 'success' : 'secondary'"
                  size="small"
                  class="cursor-pointer"
                  @click="item.decision = 'APPROVED'"
                >
                  <i-mdi-check class="mr-0.5" /> Approve
                </VaChip>
                <VaChip
                  :color="item.decision === 'REJECTED' ? 'danger' : 'secondary'"
                  size="small"
                  class="cursor-pointer"
                  @click="item.decision = 'REJECTED'"
                >
                  <i-mdi-close class="mr-0.5" /> Reject
                </VaChip>
              </div>
            </div>

            <!-- Justification -->
            <VaTextarea
              v-model="getReviewState(req.id).justification"
              label="Justification (optional)"
              rows="2"
            />

            <!-- Submit -->
            <div class="flex justify-end">
              <VaButton
                preset="primary"
                size="small"
                :loading="submittingId === req.id"
                :disabled="!canSubmitReview(req.id)"
                @click="handleSubmitReview(req)"
              >
                Submit Review
              </VaButton>
            </div>
          </div>
        </div>
      </VaCardContent>
    </VaCard>
  </div>
</template>

<script setup>
import AccessRequestService from '@/services/v2/access-requests'
import { useToast } from 'vuestic-ui'

const props = defineProps({
  requests: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['reviewed'])

const { init: toast } = useToast()
const submittingId = ref(null)

// Per-request review state map
const reviewStates = reactive({})

function getReviewState(reqId) {
  if (!reviewStates[reqId]) {
    const req = props.requests.find((r) => r.id === reqId)
    const items = (req?.items ?? []).map((it) => ({
      id: it.id,
      label: it.access_type?.name ?? it.id,
      decision: null,
    }))
    reviewStates[reqId] = { items, justification: '' }
  }
  return reviewStates[reqId]
}

function canSubmitReview(reqId) {
  const state = getReviewState(reqId)
  return state.items.every((i) => i.decision !== null)
}

async function handleSubmitReview(req) {
  const state = getReviewState(req.id)
  submittingId.value = req.id
  try {
    await AccessRequestService.review(req.id, {
      items: state.items.map((i) => ({
        id: i.id,
        decision: i.decision,
        justification: state.justification || undefined,
      })),
    })
    toast({ message: 'Review submitted.', color: 'success', position: 'bottom-right' })
    delete reviewStates[req.id]
    emit('reviewed', req.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to submit review.', color: 'danger', position: 'bottom-right' })
  } finally {
    submittingId.value = null
  }
}

// Reset state when request list changes
watch(
  () => props.requests,
  () => {
    Object.keys(reviewStates).forEach((id) => {
      if (!props.requests.find((r) => r.id === id)) delete reviewStates[id]
    })
  },
)
</script>
