<route lang="yaml">
meta:
  title: Home
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- ── Page header ──────────────────────────────────────────────── -->
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Welcome back, {{ auth.user?.username }}
      </h1>
      <p class="text-sm mt-1" style="color: var(--va-secondary)">
        {{ roleDescription }}
      </p>
    </div>

    <!-- ── Platform admin: System Metrics ───────────────────────────── -->
    <template v-if="auth.canAdmin">
      <section>
        <SectionHeader icon="mdi-chart-box-outline" title="System Metrics" />
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <MetricCard
            label="Total Datasets"
            :value="datasetStats.total"
            :loading="statsLoading"
            icon="mdi-database-outline"
            color="primary"
          />
          <MetricCard
            label="Raw Data"
            :value="datasetStats.raw"
            :loading="statsLoading"
            icon="mdi-dna"
            color="info"
          />
          <MetricCard
            label="Data Products"
            :value="datasetStats.products"
            :loading="statsLoading"
            icon="mdi-package-variant-closed"
            color="success"
          />
          <MetricCard
            label="Staged"
            :value="datasetStats.staged"
            :loading="statsLoading"
            icon="mdi-layers-outline"
            color="warning"
          />
        </div>
        <div class="flex justify-end mt-2">
          <RouterLink to="/v2/admin" class="text-sm" style="color: var(--va-primary)">
            Go to Admin Console →
          </RouterLink>
        </div>
      </section>
    </template>

    <!-- ── Group admin: Governance Activity ─────────────────────────── -->
    <template v-if="showAdminSections">
      <section>
        <SectionHeader icon="mdi-shield-check-outline" title="Access Governance" />
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <!-- Pending access requests -->
          <VaCard class="cursor-pointer hover:shadow-md transition-shadow" @click="router.push('/v2/access')">
            <VaCardContent>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                    <i-mdi-inbox-arrow-down class="text-2xl text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Pending Reviews</p>
                    <p class="text-xs mt-0.5" style="color: var(--va-secondary)">Access requests awaiting your decision</p>
                  </div>
                </div>
                <VaChip
                  v-if="!accessStore.pendingReviewCountLoading"
                  :color="accessStore.pendingReviewCount > 0 ? 'warning' : 'secondary'"
                  size="small"
                >
                  {{ accessStore.pendingReviewCount }}
                </VaChip>
                <VaSkeleton v-else variant="rounded" height="24px" width="40px" />
              </div>
            </VaCardContent>
          </VaCard>

          <!-- Groups I admin -->
          <VaCard class="cursor-pointer hover:shadow-md transition-shadow" @click="router.push('/v2/groups')">
            <VaCardContent>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <i-mdi-account-group-outline class="text-2xl text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">My Groups</p>
                    <p class="text-xs mt-0.5" style="color: var(--va-secondary)">Groups you administer or belong to</p>
                  </div>
                </div>
                <VaChip color="primary" size="small">
                  {{ groupsStore.myGroups.length }}
                </VaChip>
              </div>
            </VaCardContent>
          </VaCard>
        </div>
      </section>
    </template>

    <!-- ── All users: My Groups grid ────────────────────────────────── -->
    <section>
      <div class="flex items-center justify-between mb-3">
        <SectionHeader icon="mdi-account-group-outline" title="My Groups" />
        <RouterLink to="/v2/groups" class="text-sm" style="color: var(--va-primary)">
          View all →
        </RouterLink>
      </div>

      <!-- Loading skeleton -->
      <div v-if="groupsStore.myGroupsLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <VaSkeleton v-for="n in 3" :key="n" variant="rounded" height="80px" />
      </div>

      <!-- Empty state -->
      <VaCard v-else-if="groupsStore.myGroups.length === 0">
        <VaCardContent>
          <div class="flex flex-col items-center py-6 gap-2 text-center">
            <i-mdi-account-group-outline class="text-4xl text-gray-300 dark:text-gray-600" />
            <p class="text-sm" style="color: var(--va-secondary)">You are not a member of any group yet.</p>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Group cards grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <VaCard
          v-for="group in myGroupsPreview"
          :key="group.id"
          class="cursor-pointer hover:shadow-md transition-shadow"
          @click="router.push(`/v2/groups/${group.id}`)"
        >
          <VaCardContent>
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <i-mdi-account-group class="text-xl shrink-0" style="color: var(--va-primary)" />
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ group.name }}</p>
                  <p v-if="group.description" class="text-xs truncate mt-0.5" style="color: var(--va-secondary)">
                    {{ group.description }}
                  </p>
                </div>
              </div>
              <VaChip v-if="group.is_archived" color="secondary" size="small" class="shrink-0">
                Archived
              </VaChip>
            </div>
          </VaCardContent>
        </VaCard>

        <!-- "N more" overflow card -->
        <VaCard
          v-if="groupsStore.myGroups.length > MY_GROUPS_PREVIEW_LIMIT"
          class="cursor-pointer hover:shadow-md transition-shadow border-dashed"
          @click="router.push('/v2/groups')"
        >
          <VaCardContent>
            <div class="flex items-center justify-center h-full py-2">
              <p class="text-sm" style="color: var(--va-primary)">
                +{{ groupsStore.myGroups.length - MY_GROUPS_PREVIEW_LIMIT }} more groups
              </p>
            </div>
          </VaCardContent>
        </VaCard>
      </div>
    </section>

    <!-- ── All users: My Access Requests ────────────────────────────── -->
    <section>
      <div class="flex items-center justify-between mb-3">
        <SectionHeader icon="mdi-key-outline" title="My Access Requests" />
        <RouterLink to="/v2/access" class="text-sm" style="color: var(--va-primary)">
          View all →
        </RouterLink>
      </div>

      <div v-if="accessStore.myRequestsLoading" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <VaSkeleton v-for="n in 4" :key="n" variant="rounded" height="64px" />
      </div>

      <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RequestStatusCard
          v-for="status in REQUEST_STATUSES"
          :key="status.key"
          :label="status.label"
          :count="requestCountByStatus[status.key]"
          :color="status.color"
          :icon="status.icon"
        />
      </div>
    </section>

    <!-- ── All users: Collections shortcut ──────────────────────────── -->
    <section>
      <SectionHeader icon="mdi-folder-multiple-outline" title="Collections" />
      <VaCard class="mt-3 cursor-pointer hover:shadow-md transition-shadow" @click="router.push('/v2/collections')">
        <VaCardContent>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                <i-mdi-folder-multiple-outline class="text-2xl text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Browse Collections</p>
                <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                  Collections are authorization containers — being added to one changes your data access.
                </p>
              </div>
            </div>
            <i-mdi-chevron-right class="text-xl" style="color: var(--va-secondary)" />
          </div>
        </VaCardContent>
      </VaCard>
    </section>
  </div>
</template>

<script setup>
import DatasetService from '@/services/v2/datasets'
import { useAuthStore } from '@/stores/auth'
import { useNavStore } from '@/stores/nav'
import { useAccessStore } from '@/stores/v2/access'
import { useGroupsStore } from '@/stores/v2/groups'

// ── Stores & router ─────────────────────────────────────────────────────────
const auth = useAuthStore()
const nav = useNavStore()
const router = useRouter()
const groupsStore = useGroupsStore()
const accessStore = useAccessStore()

// ── Constants ────────────────────────────────────────────────────────────────
const MY_GROUPS_PREVIEW_LIMIT = 5

const REQUEST_STATUSES = [
  { key: 'UNDER_REVIEW', label: 'Pending', color: 'warning', icon: 'mdi-clock-outline' },
  { key: 'APPROVED',     label: 'Approved', color: 'success', icon: 'mdi-check-circle-outline' },
  { key: 'REJECTED',     label: 'Rejected', color: 'danger',  icon: 'mdi-close-circle-outline' },
  { key: 'EXPIRED',      label: 'Expired',  color: 'secondary', icon: 'mdi-calendar-remove-outline' },
]

// ── Role helpers ─────────────────────────────────────────────────────────────
/**
 * Show admin governance sections if user is a platform admin or an operator.
 * TODO: refine once the API returns per-group caller role, so true group-level
 * admin detection is possible without relying on the platform `operator` role.
 */
const showAdminSections = computed(() => auth.canOperate)

const roleDescription = computed(() => {
  if (auth.canAdmin) return 'Platform Administrator — system-wide governance view'
  if (auth.canOperate) return 'Operator — governance view for your groups'
  return 'Member — personal data and access view'
})

// ── Data: groups ─────────────────────────────────────────────────────────────
const myGroupsPreview = computed(() =>
  groupsStore.myGroups.slice(0, MY_GROUPS_PREVIEW_LIMIT),
)

// ── Data: access requests ────────────────────────────────────────────────────
const requestCountByStatus = computed(() => {
  const counts = { UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 }
  for (const req of accessStore.myRequests) {
    if (req.status in counts) counts[req.status]++
  }
  return counts
})

// ── Data: dataset stats (platform admin) ─────────────────────────────────────
const statsLoading = ref(false)
const datasetStats = reactive({ total: null, raw: null, products: null, staged: null })

async function fetchDatasetStats() {
  if (!auth.canAdmin) return
  statsLoading.value = true
  try {
    const [rawRes, prodRes] = await Promise.all([
      DatasetService.getStats({ type: 'RAW_DATA' }),
      DatasetService.getStats({ type: 'DATA_PRODUCT' }),
    ])
    const raw = rawRes.data ?? {}
    const prod = prodRes.data ?? {}
    datasetStats.raw = raw.count ?? raw.total ?? null
    datasetStats.products = prod.count ?? prod.total ?? null
    datasetStats.staged = (raw.staged ?? 0) + (prod.staged ?? 0)
    datasetStats.total =
      (datasetStats.raw ?? 0) + (datasetStats.products ?? 0)
  } catch {
    // stats are best-effort; fail silently
  } finally {
    statsLoading.value = false
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  nav.setNavItems([], false)

  await Promise.all([
    groupsStore.fetchMyGroups(),
    accessStore.fetchMyRequests(),
    showAdminSections.value && accessStore.fetchPendingReviewCount(),
    auth.canAdmin && fetchDatasetStats(),
  ])
})
</script>
