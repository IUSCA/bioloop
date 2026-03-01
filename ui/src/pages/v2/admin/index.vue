<route lang="yaml">
meta:
  title: Admin
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- Page header -->
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Admin Console</h1>
      <p class="text-sm mt-1" style="color: var(--va-secondary)">
        <span v-if="auth.canAdmin">Platform-level governance and system settings.</span>
        <span v-else>Manage groups, datasets, and collections you administer.</span>
      </p>
    </div>

    <!-- ── Admin cards grid ───────────────────────────────────────────── -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Group Administration -->
      <VaCard
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/v2/groups?scope=admin')"
      >
        <VaCardContent>
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 shrink-0">
              <i-mdi-account-group class="text-2xl text-blue-600 dark:text-blue-400" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">Group Administration</p>
              <p class="text-xs mt-1" style="color: var(--va-secondary)">
                View and manage groups you administer. Add or remove members, manage admins, and
                archive groups.
              </p>
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <span class="text-xs" style="color: var(--va-primary)">Open →</span>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Dataset Governance -->
      <VaCard
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/v2/datasets')"
      >
        <VaCardContent>
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 shrink-0">
              <i-mdi-database class="text-2xl text-emerald-600 dark:text-emerald-400" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">Dataset Governance</p>
              <p class="text-xs mt-1" style="color: var(--va-secondary)">
                Browse datasets owned by your groups. Grant access, archive, and manage visibility.
              </p>
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <span class="text-xs" style="color: var(--va-primary)">Open →</span>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Collection Governance -->
      <VaCard
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/v2/collections')"
      >
        <VaCardContent>
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/30 shrink-0">
              <i-mdi-folder-multiple class="text-2xl text-purple-600 dark:text-purple-400" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">Collection Governance</p>
              <p class="text-xs mt-1" style="color: var(--va-secondary)">
                Manage collections owned by your groups. Add datasets, grant collection-level access.
              </p>
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <span class="text-xs" style="color: var(--va-primary)">Open →</span>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Access Governance -->
      <VaCard
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/v2/access?tab=active-grants')"
      >
        <VaCardContent>
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 shrink-0">
              <i-mdi-key class="text-2xl text-amber-600 dark:text-amber-400" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">Access Governance</p>
              <p class="text-xs mt-1" style="color: var(--va-secondary)">
                View active grants on your group-owned resources. Revoke grants and review pending
                access requests.
              </p>
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <span class="text-xs" style="color: var(--va-primary)">Open →</span>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- System Settings — platform admin only -->
      <VaCard
        v-if="auth.canAdmin"
        class="cursor-pointer hover:shadow-md transition-shadow border-2 border-red-100 dark:border-red-900/50"
        @click="router.push('/v2/groups')"
      >
        <VaCardContent>
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 shrink-0">
              <i-mdi-cog class="text-2xl text-red-600 dark:text-red-400" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                System Settings
                <VaChip color="danger" size="small" class="ml-1">Platform Admin</VaChip>
              </p>
              <p class="text-xs mt-1" style="color: var(--va-secondary)">
                Global group explorer, system metrics, archival overrides, and incident controls.
              </p>
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <span class="text-xs" style="color: var(--va-primary)">Open →</span>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- ── Quick stats (platform admin only) ──────────────────────────── -->
    <template v-if="auth.canAdmin">
      <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
        <SectionHeader icon="mdi-chart-box-outline" title="System Overview" class="mb-4" />
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="My Groups"
            :value="groupsStore.myGroups.length"
            :loading="groupsStore.myGroupsLoading"
            icon="mdi-account-group-outline"
            color="primary"
          />
          <MetricCard
            label="Pending Reviews"
            :value="accessStore.pendingReviewCount"
            :loading="accessStore.pendingReviewCountLoading"
            icon="mdi-inbox-arrow-down"
            color="warning"
          />
          <MetricCard
            label="My Requests"
            :value="accessStore.myRequests.length"
            :loading="accessStore.myRequestsLoading"
            icon="mdi-key-outline"
            color="info"
          />
          <MetricCard
            label="Collections"
            :value="null"
            icon="mdi-folder-multiple-outline"
            color="success"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { useAccessStore } from '@/stores/v2/access'
import { useGroupsStore } from '@/stores/v2/groups'

const auth = useAuthStore()
const accessStore = useAccessStore()
const groupsStore = useGroupsStore()
const router = useRouter()

onMounted(async () => {
  await Promise.all([
    groupsStore.myGroups.length === 0 && groupsStore.fetchMyGroups(),
    accessStore.fetchPendingReviewCount(),
    accessStore.myRequests.length === 0 && accessStore.fetchMyRequests(),
  ])
})
</script>
