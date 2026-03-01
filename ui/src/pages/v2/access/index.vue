<route lang="yaml">
meta:
  title: Access
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- Page header -->
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Access</h1>
      <p class="text-sm mt-1" style="color: var(--va-secondary)">
        Manage access requests and grants.
      </p>
    </div>

    <!-- ── Tabs ──────────────────────────────────────────────────────── -->
    <VaTabs v-model="activeTab">
      <template #tabs>
        <VaTab name="my-requests">My Requests</VaTab>
        <VaTab v-if="auth.canOperate" name="pending-review">
          Pending Review
          <VaBadge
            v-if="accessStore.pendingReviewCount > 0"
            :text="String(accessStore.pendingReviewCount)"
            color="warning"
            class="ml-1"
          />
        </VaTab>
        <VaTab name="active-grants">Active Grants</VaTab>
        <VaTab name="expiring-grants">Expiring Grants</VaTab>
        <VaTab v-if="auth.canAdmin" name="simulation">Access Simulation</VaTab>
      </template>
    </VaTabs>

    <div class="mt-2">
      <!-- ── My Requests ────────────────────────────────────────────── -->
      <template v-if="activeTab === 'my-requests'">
        <!-- Status filter chips -->
        <div class="flex flex-wrap gap-2 mb-4">
          <VaChip
            v-for="s in REQUEST_STATUS_FILTERS"
            :key="s.key"
            :color="statusFilter === s.key ? s.color : 'secondary'"
            class="cursor-pointer"
            @click="statusFilter = statusFilter === s.key ? null : s.key"
          >
            {{ s.label }}
            <span class="ml-1 opacity-70">({{ requestCountByStatus[s.key] }})</span>
          </VaChip>
        </div>

        <div v-if="accessStore.myRequestsLoading" class="flex flex-col gap-3">
          <VaSkeleton v-for="n in 3" :key="n" variant="rounded" height="100px" />
        </div>

        <div v-else-if="filteredRequests.length === 0" class="flex flex-col items-center py-10 gap-2 text-center">
          <i-mdi-key-outline class="text-5xl text-gray-300 dark:text-gray-600" />
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">No access requests found.</p>
        </div>

        <div v-else class="flex flex-col gap-3">
          <AccessRequestCard
            v-for="req in filteredRequests"
            :key="req.id"
            :request="req"
            :withdrawing="withdrawingId === req.id"
            @withdraw="handleWithdraw"
          />
        </div>
      </template>

      <!-- ── Pending Review ─────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'pending-review'">
        <ReviewPanel
          :requests="accessStore.pendingRequests"
          :loading="accessStore.pendingRequestsLoading"
          @reviewed="onReviewed"
        />
      </template>

      <!-- ── Active Grants ──────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'active-grants'">
        <GrantExplorer
          :can-revoke="auth.canOperate"
          :show-filters="true"
          :fixed-filters="{ active_only: true }"
        />
      </template>

      <!-- ── Expiring Grants ────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'expiring-grants'">
        <GrantExplorer
          :can-revoke="auth.canOperate"
          :show-filters="false"
          :fixed-filters="{ active_only: true, expiring_soon: true }"
        />
      </template>

      <!-- ── Access Simulation (platform admin only) ────────────────── -->
      <template v-else-if="activeTab === 'simulation' && auth.canAdmin">
        <VaCard>
          <VaCardTitle>
            <div class="flex items-center gap-2">
              <i-mdi-magnify-expand class="text-xl" style="color: var(--va-primary)" />
              Access Simulation
            </div>
          </VaCardTitle>
          <VaCardContent>
            <div class="flex flex-col gap-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Simulate access for a specific user on a dataset. Enter the user ID and dataset ID
                below to see the full grant chain.
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <VaInput v-model="simForm.userId" label="User ID" placeholder="User UUID or ID" />
                <VaInput v-model="simForm.datasetId" label="Dataset ID" placeholder="Dataset UUID or ID" />
              </div>

              <div class="flex justify-end">
                <VaButton
                  preset="primary"
                  :loading="simLoading"
                  :disabled="!simForm.userId || !simForm.datasetId"
                  icon="play_arrow"
                  @click="runSimulation"
                >
                  Simulate
                </VaButton>
              </div>

              <!-- Simulation results -->
              <template v-if="simResult !== null">
                <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div
                    v-if="simResult.length === 0"
                    class="flex flex-col items-center py-6 gap-2 text-center"
                  >
                    <i-mdi-lock-outline class="text-3xl text-gray-300 dark:text-gray-600" />
                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400">No active grants found.</p>
                  </div>
                  <div v-else class="flex flex-col gap-3">
                    <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Found {{ simResult.length }} grant path(s)
                    </h3>
                    <div
                      v-for="(grant, idx) in simResult"
                      :key="idx"
                      class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 p-3 text-sm"
                    >
                      <div class="flex flex-wrap gap-2 mb-2">
                        <VaChip color="info" size="small">{{ grant.access_type?.name ?? grant.access_type_id }}</VaChip>
                        <span v-if="grant.valid_until" class="text-xs self-center" style="color: var(--va-secondary)">
                          valid until {{ new Date(grant.valid_until).toLocaleDateString() }}
                        </span>
                        <span v-else class="text-xs self-center" style="color: var(--va-secondary)">no expiry</span>
                      </div>
                      <div class="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <div v-if="grant.grant_via_collection" class="flex items-center gap-1">
                          <i-mdi-folder-multiple-outline class="text-sm" />
                          Via collection: <strong>{{ grant.grant_via_collection.name }}</strong>
                        </div>
                        <div v-if="grant.granted_to_group" class="flex items-center gap-1">
                          <i-mdi-account-group-outline class="text-sm" />
                          Granted to group: <strong>{{ grant.granted_to_group.name }}</strong>
                        </div>
                        <div v-if="grant.membership_via" class="flex items-center gap-1">
                          <i-mdi-account-check-outline class="text-sm" />
                          Membership via: {{ grant.membership_via }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </VaCardContent>
        </VaCard>
      </template>
    </div>
  </div>
</template>

<script setup>
import AccessRequestCard from '@/components/v2/access/AccessRequestCard.vue'
import GrantExplorer from '@/components/v2/access/GrantExplorer.vue'
import ReviewPanel from '@/components/v2/access/ReviewPanel.vue'
import AccessRequestService from '@/services/v2/access-requests'
import GrantService from '@/services/v2/grants'
import { useAuthStore } from '@/stores/auth'
import { useAccessStore } from '@/stores/v2/access'
import { useToast } from 'vuestic-ui'

const auth = useAuthStore()
const accessStore = useAccessStore()
const { init: toast } = useToast()

const activeTab = ref('my-requests')

// ── My Requests ───────────────────────────────────────────────────────────
const REQUEST_STATUS_FILTERS = [
  { key: 'UNDER_REVIEW', label: 'Under Review', color: 'warning' },
  { key: 'APPROVED', label: 'Approved', color: 'success' },
  { key: 'REJECTED', label: 'Rejected', color: 'danger' },
  { key: 'EXPIRED', label: 'Expired', color: 'secondary' },
]

const statusFilter = ref(null)
const withdrawingId = ref(null)

const requestCountByStatus = computed(() => {
  const counts = { UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 }
  for (const req of accessStore.myRequests) {
    if (req.status in counts) counts[req.status]++
  }
  return counts
})

const filteredRequests = computed(() => {
  if (!statusFilter.value) return accessStore.myRequests
  return accessStore.myRequests.filter((r) => r.status === statusFilter.value)
})

async function handleWithdraw(request) {
  withdrawingId.value = request.id
  try {
    await AccessRequestService.withdraw(request.id)
    toast({ message: 'Request withdrawn.', color: 'success', position: 'bottom-right' })
    accessStore.fetchMyRequests()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to withdraw request.', color: 'danger', position: 'bottom-right' })
  } finally {
    withdrawingId.value = null
  }
}

// ── Pending Review ────────────────────────────────────────────────────────
function onReviewed() {
  accessStore.fetchPendingRequests()
  accessStore.fetchPendingReviewCount()
}

// ── Access Simulation ─────────────────────────────────────────────────────
const simForm = reactive({ userId: '', datasetId: '' })
const simLoading = ref(false)
const simResult = ref(null)

async function runSimulation() {
  simLoading.value = true
  simResult.value = null
  try {
    const { data: { data: items } } = await GrantService.list({
      subject_type: 'USER',
      subject_id: simForm.userId,
      resource_type: 'DATASET',
      resource_id: simForm.datasetId,
      active_only: true,
    })
    simResult.value = items
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Simulation failed.', color: 'danger', position: 'bottom-right' })
  } finally {
    simLoading.value = false
  }
}

// ── Tab lazy-load ─────────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'pending-review') accessStore.fetchPendingRequests()
})

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([
    accessStore.fetchMyRequests(),
    auth.canOperate && accessStore.fetchPendingReviewCount(),
  ])
})
</script>
