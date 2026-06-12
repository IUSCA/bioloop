<template>
  <div class="min-h-[calc(100vh-6rem)] bg-slate-50 dark:bg-slate-950">
    <div class="relative z-10 px-6 py-10 max-w-7xl mx-auto">
      <Transition name="fade-slide" mode="out-in">
        <div v-if="dashboard.loading || !dashboard.isLoaded" class="space-y-6">
          <VaSkeleton variant="text" height="34px" width="280px" />
          <VaSkeleton variant="text" height="20px" width="380px" />
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <VaSkeleton
              v-for="n in 4"
              :key="n"
              variant="rounded"
              height="120px"
            />
          </div>
        </div>

        <!-- Group admin dashboard (includes platform admins) -->
        <div
          v-else-if="dashboard.isGroupAdmin || dashboard.isPlatformAdmin"
          class="space-y-10"
        >
          <DashboardHero
            :title="`Hello, ${firstName}`"
            subtitle="Group admin dashboard"
            description="Quickly see access requests, expiring grants, and activity for the groups you manage."
            :role-label="
              dashboard.isPlatformAdmin ? 'Platform admin' : 'Group admin'
            "
          />

          <DashboardStatRow :cards="statCards" />

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardSection
              title="Needs your review"
              subtitle="Access requests awaiting your decision"
            >
              <div v-if="pendingRequestsLoading" class="space-y-2">
                <VaSkeleton
                  v-for="n in 3"
                  :key="n"
                  variant="rounded"
                  height="80px"
                />
              </div>
              <div
                v-else-if="pendingRequests.length === 0"
                class="text-sm text-slate-600 dark:text-slate-400"
              >
                No pending review requests at the moment.
              </div>
              <div v-else class="space-y-3">
                <DashboardRequestCard
                  v-for="req in pendingRequests"
                  :key="req.id"
                  :request="req"
                  @view="viewRequest"
                />
              </div>
            </DashboardSection>

            <DashboardSection
              title="Grants expiring soon"
              subtitle="Keep access up to date"
            >
              <div v-if="expiringGrantsLoading" class="space-y-2">
                <VaSkeleton
                  v-for="n in 3"
                  :key="n"
                  variant="rounded"
                  height="80px"
                />
              </div>
              <div
                v-else-if="expiringGrants.length === 0"
                class="text-sm text-slate-600 dark:text-slate-400"
              >
                No grants are expiring soon.
              </div>
              <div v-else class="space-y-3">
                <DashboardGrantRow
                  v-for="grant in expiringGrants"
                  :key="grant.id"
                  :grant="grant"
                  @view="viewGrant"
                />
              </div>
            </DashboardSection>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardSection
              title="My groups"
              subtitle="Groups you administer"
            >
              <div v-if="myGroupsLoading" class="space-y-2">
                <VaSkeleton
                  v-for="n in 3"
                  :key="n"
                  variant="rounded"
                  height="80px"
                />
              </div>
              <div
                v-else-if="myGroups.length === 0"
                class="text-sm text-slate-600 dark:text-slate-400"
              >
                You are not currently an admin of any groups.
              </div>
              <div v-else class="space-y-3">
                <GroupCard v-for="g in myGroups" :key="g.id" :group="g" />
              </div>
            </DashboardSection>

            <DashboardSection
              title="Recent activity"
              subtitle="Audit log events"
            >
              <div v-if="activityLoading" class="space-y-2">
                <VaSkeleton
                  v-for="n in 5"
                  :key="n"
                  variant="text"
                  height="22px"
                />
              </div>
              <div
                v-else-if="recentActivity.length === 0"
                class="text-sm text-slate-600 dark:text-slate-400"
              >
                No recent activity found.
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in recentActivity"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                >
                  <div class="min-w-0">
                    <AuditLog :record="item" class="text-sm" />
                  </div>
                  <div
                    class="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {{ datetime.displayDateTime(item.timestamp) }}
                  </div>
                </div>
              </div>
            </DashboardSection>
          </div>

          <Transition name="fade-slide" mode="out-in">
            <div v-if="error" class="mt-10">
              <ErrorState
                title="Unable to load dashboard data"
                :message="error?.message"
                @retry="fetchGroupAdminDashboard"
              />
            </div>
          </Transition>
        </div>

        <!-- Default home view for non-admins -->
        <div v-else class="space-y-10">
          <div class="flex flex-col gap-4">
            <div class="max-w-2xl">
              <p
                class="text-sm tracking-widest text-slate-500 dark:text-slate-400 uppercase"
              >
                Governance dashboard
              </p>
              <h1
                class="mt-1 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white"
              >
                A single lens on your data ecosystem
              </h1>
              <p
                class="mt-4 text-lg text-slate-700 dark:text-slate-200 leading-relaxed"
              >
                Start here to see how many groups, collections, and datasets you
                govern. Use the shortcuts below to jump into managing your
                organizational units and data access.
              </p>
            </div>

            <!-- Overview cards -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <router-link class="group" to="/v2/groups">
                <VaCard
                  class="h-full transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <VaCardContent class="flex flex-col gap-4 h-full">
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex items-center gap-3">
                        <div
                          class="flex items-center justify-center w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                        >
                          <i-mdi-account-group-outline class="text-2xl" />
                        </div>
                        <div>
                          <p
                            class="text-sm font-semibold text-slate-900 dark:text-white"
                          >
                            Groups
                          </p>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            Organizational units &amp; governance.
                          </p>
                        </div>
                      </div>

                      <div class="text-right">
                        <p
                          class="text-2xl font-semibold text-slate-900 dark:text-white"
                        >
                          <template v-if="homeLoading">
                            <VaSkeleton
                              variant="text"
                              height="28px"
                              width="60px"
                            />
                          </template>
                          <template v-else>
                            {{ counts.groups ?? "—" }}
                          </template>
                        </p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          total
                        </p>
                      </div>
                    </div>

                    <p class="text-xs text-slate-600 dark:text-slate-300">
                      Click to browse groups and manage membership.
                    </p>
                  </VaCardContent>
                </VaCard>
              </router-link>
              <router-link class="group" to="/v2/collections">
                <VaCard
                  class="h-full transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <VaCardContent class="flex flex-col gap-4 h-full">
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex items-center gap-3">
                        <div
                          class="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                        >
                          <i-mdi-folder-multiple-outline class="text-2xl" />
                        </div>
                        <div>
                          <p
                            class="text-sm font-semibold text-slate-900 dark:text-white"
                          >
                            Collections
                          </p>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            Group datasets into shared access containers.
                          </p>
                        </div>
                      </div>

                      <div class="text-right">
                        <p
                          class="text-2xl font-semibold text-slate-900 dark:text-white"
                        >
                          <template v-if="homeLoading">
                            <VaSkeleton
                              variant="text"
                              height="28px"
                              width="60px"
                            />
                          </template>
                          <template v-else>
                            {{ counts.collections ?? "—" }}
                          </template>
                        </p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          total
                        </p>
                      </div>
                    </div>

                    <p class="text-xs text-slate-600 dark:text-slate-300">
                      Click to view collections and configure membership.
                    </p>
                  </VaCardContent>
                </VaCard>
              </router-link>
              <router-link class="group" to="/v2/access">
                <VaCard
                  class="h-full transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <VaCardContent class="flex flex-col gap-4 h-full">
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex items-center gap-3">
                        <div
                          class="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
                        >
                          <i-mdi-key-outline class="text-2xl" />
                        </div>
                        <div>
                          <p
                            class="text-sm font-semibold text-slate-900 dark:text-white"
                          >
                            Access
                          </p>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            Review and manage grants across resources.
                          </p>
                        </div>
                      </div>

                      <div class="text-right">
                        <p
                          class="text-2xl font-semibold text-slate-900 dark:text-white"
                        >
                          <template v-if="homeLoading">
                            <VaSkeleton
                              variant="text"
                              height="28px"
                              width="60px"
                            />
                          </template>
                          <template v-else>
                            {{ counts.datasets ?? "—" }}
                          </template>
                        </p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          datasets
                        </p>
                      </div>
                    </div>

                    <p class="text-xs text-slate-600 dark:text-slate-300">
                      Click to review recent activity and grants.
                    </p>
                  </VaCardContent>
                </VaCard>
              </router-link>
            </div>

            <!-- Recent activity -->
            <section class="mt-10">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2
                    class="text-xl font-semibold text-slate-900 dark:text-white"
                  >
                    Recent activity
                  </h2>
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Latest events from the audit log.
                  </p>
                </div>
                <VaButton
                  size="small"
                  preset="secondary"
                  color="primary"
                  @click="fetchRecentActivity"
                >
                  Refresh
                </VaButton>
              </div>

              <VaCard class="mt-4">
                <VaCardContent>
                  <div v-if="activityLoading" class="space-y-2">
                    <VaSkeleton
                      v-for="n in 5"
                      :key="n"
                      variant="text"
                      height="22px"
                    />
                  </div>

                  <div
                    v-else-if="activityError"
                    class="text-sm text-red-600 dark:text-red-400"
                  >
                    {{ activityError }}
                  </div>

                  <div
                    v-else-if="recentActivity.length === 0"
                    class="text-sm text-slate-600 dark:text-slate-400"
                  >
                    No recent activity found.
                  </div>

                  <div v-else class="space-y-2">
                    <div
                      v-for="item in recentActivity"
                      :key="item.id"
                      class="flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                    >
                      <div class="min-w-0">
                        <AuditLog :record="item" class="text-sm" />
                      </div>
                      <div
                        class="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
                      >
                        {{ datetime.displayDateTime(item.timestamp) }}
                      </div>
                    </div>
                  </div>
                </VaCardContent>
              </VaCard>
            </section>

            <Transition name="fade-slide" mode="out-in">
              <div v-if="error" class="mt-10">
                <ErrorState
                  title="Unable to load dashboard statistics"
                  :message="error?.message"
                  @retry="fetchStats"
                />
              </div>
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import AccessRequestService from "@/services/v2/access-requests";
import AuditLogsService from "@/services/v2/audit-logs";
import CollectionService from "@/services/v2/collections";
import DatasetServiceV2 from "@/services/v2/datasets";
import GrantsService from "@/services/v2/grants";
import GroupService from "@/services/v2/groups";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "vue-router";

const router = useRouter();
const auth = useAuthStore();
// const uiPersonaStore = useUIPersonaStore();

const firstName = computed(() => {
  const name = auth.user?.name || "";
  return name.split(" ")[0] || name;
});

const pendingRequests = ref([]);
const pendingRequestsTotal = ref(null);
const pendingRequestsLoading = ref(false);

const expiringGrants = ref([]);
const expiringGrantsTotal = ref(null);
const expiringGrantsLoading = ref(false);

const myGroups = ref([]);
const myGroupsTotal = ref(null);
const myGroupsLoading = ref(false);

const datasetCount = ref(null);
const datasetLoading = ref(false);

const recentActivity = ref([]);
const activityLoading = ref(true);
const activityError = ref(null);

const error = ref(null);

const homeLoading = ref(true);
const counts = ref({
  groups: null,
  collections: null,
  datasets: null,
});

const statCards = computed(() => [
  {
    label: "Pending reviews",
    value: pendingRequestsTotal.value,
    loading: pendingRequestsLoading.value,
    icon: "mdi-timer-sand",
    color: "warning",
  },
  {
    label: "Owned datasets",
    value: datasetCount.value,
    loading: datasetLoading.value,
    icon: "mdi-database",
    color: "primary",
  },
  {
    label: "Expiring grants",
    value: expiringGrantsTotal.value,
    loading: expiringGrantsLoading.value,
    icon: "mdi-alert-circle",
    color: "danger",
  },
  {
    label: "My groups",
    value: myGroupsTotal.value,
    loading: myGroupsLoading.value,
    icon: "mdi-account-group",
    color: "secondary",
  },
]);

async function fetchGroupAdminDashboard() {
  error.value = null;
  pendingRequestsLoading.value = true;
  expiringGrantsLoading.value = true;
  myGroupsLoading.value = true;
  datasetLoading.value = true;
  activityLoading.value = true;

  try {
    const [pendingResp, grantsResp, groupsResp, datasetsResp, activityResp] =
      await Promise.allSettled([
        AccessRequestService.pendingReview({ limit: 5 }),
        GrantsService.expiringGrants({
          within_days: 30,
          limit: 5,
          sort_by: "valid_to",
          sort_order: "asc",
        }),
        GroupService.search({ scope: "admin", limit: 5, offset: 0 }),
        DatasetServiceV2.search({ scope: "ownership", limit: 0 }),
        AuditLogsService.getAuditRecords({
          limit: 5,
          sortBy: "timestamp",
          sortOrder: "desc",
        }),
      ]);

    if (pendingResp.status === "fulfilled") {
      pendingRequests.value = pendingResp.value.data.data;
      pendingRequestsTotal.value = pendingResp.value.data.metadata?.total ?? 0;
    }

    if (grantsResp.status === "fulfilled") {
      expiringGrants.value = grantsResp.value.data.data;
      expiringGrantsTotal.value = grantsResp.value.data.metadata?.total ?? 0;
    }

    if (groupsResp.status === "fulfilled") {
      myGroups.value = groupsResp.value.data.data;
      myGroupsTotal.value = groupsResp.value.data.metadata?.total ?? 0;
    }

    if (datasetsResp.status === "fulfilled") {
      datasetCount.value = datasetsResp.value.data.metadata?.total ?? 0;
    }

    if (activityResp.status === "fulfilled") {
      recentActivity.value = activityResp.value.data;
    }

    const rejected = [
      pendingResp,
      grantsResp,
      groupsResp,
      datasetsResp,
      activityResp,
    ].find((r) => r.status === "rejected");
    if (rejected) {
      throw rejected.reason || new Error("Failed to load some dashboard data.");
    }
  } catch (err) {
    error.value = err;
    console.error(err);
  } finally {
    pendingRequestsLoading.value = false;
    expiringGrantsLoading.value = false;
    myGroupsLoading.value = false;
    datasetLoading.value = false;
    activityLoading.value = false;
  }
}

async function fetchHomeStats() {
  homeLoading.value = true;
  error.value = null;

  try {
    const [groupsResp, collectionsResp, datasetsResp] = await Promise.all([
      GroupService.search({ limit: 1, offset: 0 }),
      // NOTE: Collections search is intentionally an API wrapper, not v2.
      // The old home dashboard is kept for compatibility.
      // eslint-disable-next-line no-undef
      CollectionService.search({ limit: 1, offset: 0 }),
      // dataset stats endpoint does not exist in v2, so we keep the old behavior
      DatasetService.getStats(),
    ]);

    counts.value.groups = groupsResp.data.metadata.total;
    counts.value.collections = collectionsResp.data.metadata.total;
    counts.value.datasets = datasetsResp?.data?.count ?? null;
  } catch (err) {
    error.value = err;
  } finally {
    homeLoading.value = false;
  }
}

async function fetchRecentActivity() {
  activityLoading.value = true;
  activityError.value = null;

  try {
    const res = await AuditLogsService.getAuditRecords({
      limit: 5,
      sortBy: "timestamp",
      sortOrder: "desc",
    });
    recentActivity.value = res.data;
  } catch (err) {
    activityError.value = "Failed to load recent activity.";
    console.error(err);
  } finally {
    activityLoading.value = false;
  }
}

function viewRequest(request) {
  // TODO: wire to a dedicated access request page when available
  router.push({ path: `/access-requests/${request.id}` }).catch(() => {});
}

function viewGrant(grant) {
  // TODO: wire to a grant detail page when available
  console.warn("Navigate to grant detail not implemented", grant);
}

onMounted(async () => {
  // await dashboard.detectRole();
  // if (dashboard.isGroupAdmin || dashboard.isPlatformAdmin) {
  //   fetchGroupAdminDashboard();
  // } else {
  fetchHomeStats();
  fetchRecentActivity();
  // }
});
</script>

<route lang="yaml">
meta:
  title: Home
  nav:
    - { label: "Home" }
</route>
