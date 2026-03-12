<template>
  <div class="flex flex-col gap-4">
    <!-- Loading -->
    <template v-if="loading">
      <VaSkeleton variant="text" height="16px" width="200px" />
      <VaSkeleton variant="text" height="32px" width="280px" />
      <VaSkeleton variant="rounded" height="44px" />
      <VaSkeleton variant="rounded" height="360px" />
    </template>

    <!-- Error -->
    <ErrorState
      v-else-if="error"
      :title="'Failed to load group'"
      :message="error?.message"
      @retry="fetchGroupData"
    />

    <!-- Loaded -->
    <template v-else-if="group">
      <!-- Page header -->
      <div class="flex items-center justify-between flex-wrap gap-3 mt-3">
        <div class="flex items-center gap-3">
          <i-mdi-account-group
            class="text-2xl shrink-0"
            style="color: var(--va-primary)"
          />
          <div>
            <h1 class="text-xl font-semibold">
              {{ group.name }}
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <GroupMemberRoleBadge :role-name="callerRole" size="medium" />
        </div>
      </div>

      <!-- Oversight banner -->
      <!-- <AuthorityBanner v-if="isOversight" /> -->

      <!-- Tabs -->

      <VaTabs
        v-model="activeTab"
        class="border-b border-solid border-blue-500/50"
      >
        <template #tabs>
          <VaTab name="overview">Overview</VaTab>

          <VaTab v-if="showMembers" name="members">
            <span class="flex items-center gap-1.5">
              Members
              <span v-if="counts.members !== null" class="tab-count-badge">
                {{ counts.members }}
              </span>
            </span>
          </VaTab>

          <VaTab v-if="showDescendants" name="subgroups">
            <span class="flex items-center gap-1.5">
              Subgroups
              <span v-if="counts.subgroups !== null" class="tab-count-badge">
                {{ counts.subgroups }}
              </span>
            </span>
          </VaTab>

          <VaTab v-if="showResources" name="resources">
            <span class="flex items-center gap-1.5">
              Resources
              <span v-if="counts.resources !== null" class="tab-count-badge">
                {{ counts.resources }}
              </span>
            </span>
          </VaTab>

          <VaTab v-if="showAuditLogs" name="audit-log">Audit Log</VaTab>
        </template>
      </VaTabs>

      <!-- Tab panels -->
      <div class="">
        <GroupOverviewTab
          v-if="activeTab === 'overview'"
          :group="group"
          :ancestors="ancestors"
          :counts="counts"
          :can-edit="can('edit_metadata')"
          @archive="showArchiveModal = true"
        />

        <GroupMembersTab
          v-else-if="activeTab === 'members'"
          :group-id="props.id"
          :can-add="can('add_member')"
          :can-remove="can('remove_member')"
          :can-edit-role="can('edit_member_role')"
          @count-changed="handleMembersUpdate"
        />

        <GroupSubgroupsTab
          v-else-if="activeTab === 'subgroups'"
          :group-id="props.id"
          @count-changed="handleSubgroupsUpdate"
        />

        <GroupResourcesTab
          v-else-if="activeTab === 'resources'"
          :group-id="props.id"
          @count-changed="(n) => (counts.resources = n)"
        />

        <VaCard v-else-if="activeTab === 'audit-log'">
          <VaCardContent>
            <div class="flex flex-col items-center py-10 gap-2 text-center">
              <i-mdi-history
                class="text-4xl text-gray-300 dark:text-gray-600"
              />
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                Audit log coming soon.
              </p>
            </div>
          </VaCardContent>
        </VaCard>
      </div>

      <!-- Archive confirm modal -->
      <ArchiveConfirmModal
        v-model="showArchiveModal"
        :group-name="group.name"
        :loading="archiving"
        @confirm="handleArchive"
      />
    </template>
  </div>
</template>

<script setup>
import GroupService from "@/services/v2/groups";
import { useNavStore } from "@/stores/nav";
import { useToast } from "vuestic-ui";

const props = defineProps({ id: { type: String, required: true } });

const nav = useNavStore();
const { init: toast } = useToast();

// ── Group state ───────────────────────────────────────────────────────────
const group = ref(null);
const loading = ref(false);
const error = ref(null);

// ── Tab state ─────────────────────────────────────────────────────────────
// activeTab controls which panel is shown
const activeTab = ref("overview");

// counts live here; each tab component emits count-changed when mutations fire
// null = not yet fetched, number = loaded value
const counts = ref({ members: null, subgroups: null, resources: null });

// ── Derived ───────────────────────────────────────────────────────────────
const ancestors = computed(() => group.value?.ancestors ?? []);

const callerRole = computed(() => group.value?._meta?.caller_role);
// const isOversight = computed(() => callerRole.value === "OVERSIGHT");
const capabilities = computed(
  () => new Set(group.value?._meta?.capabilities ?? []),
);
function can(action) {
  return capabilities.value.has(action);
}

const showMembers = computed(() => can("view_members"));
const showDescendants = computed(() => can("view_descendants"));
const showResources = computed(() => can("view_resources"));
const showAuditLogs = computed(() => can("view_audit_logs"));

// ── Helpers ───────────────────────────────────────────────────────────────

function setNavBreadcrumbs(g) {
  const items = [{ label: "Groups", to: "/v2/groups" }];
  [...(g.ancestors ?? [])]
    .sort((a, b) => b.depth - a.depth)
    .forEach((a) => items.push({ label: a.name, to: `/v2/groups/${a.id}` }));
  items.push({ label: "..." });
  nav.setNavItems(items);
}

// ── Fetch group ───────────────────────────────────────────────────────────
async function fetchGroupData() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await GroupService.get(props.id);
    group.value = data;
    setNavBreadcrumbs(data);
    // fetch all tab counts in parallel after group loads
    await fetchCounts();
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

// ── Tab count fetches (parallel, fail-silently) ───────────────────────────
async function fetchCounts() {
  const fetchers = [];

  if (can("view_members")) {
    fetchers.push(
      GroupService.getDirectMembers(props.id, { limit: 0 })
        .then((r) => {
          counts.value.members = r.data.metadata.total;
        })
        .catch(() => {}),
    );
  }

  if (can("view_descendants")) {
    fetchers.push(
      GroupService.getDescendants(props.id)
        .then((r) => {
          counts.value.subgroups = Array.isArray(r.data) ? r.data.length : 0;
        })
        .catch(() => {}),
    );
  }

  if (can("view_resources")) {
    fetchers.push(
      Promise.all([
        GroupService.getDatasets(props.id, { limit: 0 }),
        GroupService.getCollections(props.id, { limit: 0 }),
      ])
        .then(([ds, cs]) => {
          counts.value.resources =
            (ds.data.metadata?.total ?? 0) + (cs.data.metadata?.total ?? 0);
        })
        .catch(() => {}),
    );
  }

  await Promise.all(fetchers);
}

function handleMembersUpdate() {
  if (can("view_members")) {
    GroupService.getDirectMembers(props.id, { limit: 0 })
      .then((r) => {
        counts.value.members = r.data.metadata.total;
      })
      .catch(() => {});
  }
}

function handleSubgroupsUpdate() {
  if (can("view_descendants")) {
    GroupService.getDescendants(props.id)
      .then((r) => {
        counts.value.subgroups = Array.isArray(r.data) ? r.data.length : 0;
      })
      .catch(() => {});
  }
}

// ── Archive ───────────────────────────────────────────────────────────────
const showArchiveModal = ref(false);
const archiving = ref(false);

async function handleArchive() {
  archiving.value = true;
  try {
    await GroupService.archive(props.id);
    toast({
      message: "Group archived.",
      color: "success",
      position: "bottom-right",
    });
    showArchiveModal.value = false;
    await fetchGroupData();
  } catch (err) {
    toast({
      message: err?.response?.data?.message ?? "Failed to archive group.",
      color: "danger",
      position: "bottom-right",
    });
  } finally {
    archiving.value = false;
  }
}

onMounted(() => fetchGroupData());
</script>

<style scoped>
.tab-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  background-color: rgb(219 234 254);
  color: rgb(29 78 216);
}

.dark .tab-count-badge {
  background-color: rgb(30 58 138 / 0.5);
  color: rgb(147 197 253);
}
</style>

<route lang="yaml">
meta:
  title: Group Detail
</route>
