<template>
  <Transition name="fade-slide" mode="out-in" class="flex flex-col gap-4">
    <!-- Loading -->
    <div v-if="loading">
      <VaSkeleton variant="text" height="32px" width="200px" />
      <VaSkeleton variant="text" height="32px" width="280px" />
      <VaSkeleton variant="squared" height="360px" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="py-12 px-6">
      <ErrorState
        :title="'Failed to load group'"
        :error="error"
        subject="this group"
        @retry="fetchGroupData"
      />
    </div>

    <!-- Loaded -->
    <div v-else-if="group" data-testid="group-detail">
      <!-- Page header -->
      <div class="flex items-center justify-between flex-wrap gap-3 mt-3">
        <div class="flex items-center gap-3">
          <ProfileAvatar
            kind="group"
            :name="group.name"
            :avatar-url="group.avatar_key ? avatarUrl : null"
            :size="40"
          />
          <div>
            <h1 class="text-xl font-semibold">
              {{ group.name }}
            </h1>
            <p
              v-if="group.tagline"
              class="text-sm mt-0.5 max-w-3xl"
              style="color: var(--va-secondary)"
            >
              {{ group.tagline }}
            </p>
          </div>
          <div>
            <Badge v-if="group.is_archived" color="neutral" class="ml-2">
              Archived
            </Badge>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <RoleBadge :role-name="callerRole" size="base" />
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

          <VaTab name="datasets">
            <span class="flex items-center gap-1.5">
              Datasets
              <span v-if="counts.datasets !== null" class="tab-count-badge">
                {{ counts.datasets }}
              </span>
            </span>
          </VaTab>

          <VaTab name="collections">
            <span class="flex items-center gap-1.5">
              Collections
              <span v-if="counts.collections !== null" class="tab-count-badge">
                {{ counts.collections }}
              </span>
            </span>
          </VaTab>

          <VaTab v-if="can('view_invitations')" name="invitations">
            <span class="flex items-center gap-1.5">
              Invitations
              <span v-if="counts.invitations !== null" class="tab-count-badge">
                {{ counts.invitations }}
              </span>
            </span>
          </VaTab>

          <VaTab v-if="can('view_audit_logs')" name="audit-log">
            Audit Log
          </VaTab>
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
          :can-archive="enabled('archive')"
          :can-unarchive="enabled('unarchive')"
          :can-add-member="can('add_member')"
          :can-create-subgroup="can('create_child')"
          :can-create-collection="can('add_collection')"
          :available-actions="availableActionList"
          @toggle-archive="openArchiveModal"
          @update="fetchGroupData"
          @action-requested="handleActionRequested"
        />

        <GroupMembersTab
          ref="membersTabRef"
          v-else-if="activeTab === 'members'"
          :group-id="props.id"
          :can-add="can('add_member')"
          :can-remove="can('remove_member')"
          :can-edit-role="can('edit_member_role')"
          :can-invite="can('invite')"
          :available-actions="availableActionList"
          @count-changed="handleMembersUpdate"
          @invite="openAddMemberModal"
        />

        <GroupSubgroupsTab
          ref="subgroupsTabRef"
          v-else-if="activeTab === 'subgroups'"
          :group="group"
          :can-create="can('create_child')"
          :available-actions="availableActionList"
          @count-changed="handleSubgroupsUpdate"
        />

        <GroupDatasetsTab
          v-else-if="activeTab === 'datasets'"
          :group-id="props.id"
          :group="group"
          :can-create="can('add_dataset')"
          :available-actions="availableActionList"
          @count-changed="handleDatasetsUpdate"
        />

        <GroupCollectionsTab
          ref="collectionsTabRef"
          v-else-if="activeTab === 'collections'"
          :group="group"
          :can-create="can('add_collection')"
          :available-actions="availableActionList"
          @count-changed="handleCollectionsUpdate"
        />

        <GroupInvitationsTab
          ref="invitationsTabRef"
          v-else-if="activeTab === 'invitations'"
          :group-id="props.id"
          :can-invite="can('invite')"
          :available-actions="availableActionList"
          @count-changed="handleInvitationsUpdate"
          @invite="openAddMemberModal"
        />

        <GroupAuditTab
          v-else-if="activeTab === 'audit-log'"
          :group-id="props.id"
        />
      </div>

      <!--
        Mounted by the page rather than by a tab, because both the members tab and the
        invitations tab open it and only one of them is rendered at a time. A ref into an
        unrendered sibling is null, which is what left the invitations tab's invite button
        doing nothing.
      -->
      <AddGroupMemberModal
        ref="addMemberModal"
        :group-id="props.id"
        :can-invite="can('invite')"
        @update="handleMemberAdded"
        @invited="handleInvited"
      />

      <!-- Archive confirm modal -->
      <GroupArchiveConfirmModal
        ref="archiveModal"
        :group-id="props.id"
        :group-name="group.name"
        :group-slug="group.slug"
        :action="enabled('unarchive') ? 'unarchive' : 'archive'"
        :affected-members="counts.members"
        :affected-datasets="counts.datasets"
        :affected-collections="counts.collections"
        @update="handleUpdate"
      />
    </div>
  </Transition>
</template>

<script setup>
import ProfileAvatar from "@/components/v2/profiles/ProfileAvatar.vue";
import { useCapabilities } from "@/composables/useCapabilities";
import CollectionService from "@/services/v2/collections";
import DatasetService from "@/services/v2/datasets";
import GroupService from "@/services/v2/groups";
import ProfileService from "@/services/v2/profiles";
import { badgeFor } from "@/services/v2/standing";
import { useNavStore } from "@/stores/nav";

const props = defineProps({ id: { type: String, required: true } });

const nav = useNavStore();

// ── Group state ───────────────────────────────────────────────────────────
const group = ref(null);
const loading = ref(true);
const error = ref(null);

// ── Tab state ─────────────────────────────────────────────────────────────
// activeTab controls which panel is shown
const activeTab = ref("overview");

// counts live here; each tab component emits count-changed when mutations fire
// null = not yet fetched, number = loaded value
const counts = ref({
  members: null,
  subgroups: null,
  datasets: null,
  collections: null,
  invitations: null,
});

const membersTabRef = ref(null);
const invitationsTabRef = ref(null);
const subgroupsTabRef = ref(null);
const addMemberModal = ref(null);

function openAddMemberModal() {
  addMemberModal.value?.show?.();
}

// Adding a member and inviting one both refresh the page's own counts, and additionally the
// tab that is currently rendered. Neither reaches through a ref for the count, so the badge
// is right whichever tab the action was started from.
function handleMemberAdded() {
  handleMembersUpdate();
  membersTabRef.value?.refresh?.();
}

function handleInvited() {
  handleInvitationsUpdate();
  invitationsTabRef.value?.refresh?.();
}
const collectionsTabRef = ref(null);

// ── Derived ───────────────────────────────────────────────────────────────
const ancestors = computed(() => group.value?.ancestors ?? []);

const avatarUrl = computed(() =>
  ProfileService.groupAvatarUrl(props.id, group.value?.avatar_key),
);

const callerRole = computed(() =>
  badgeFor(group.value?._meta?.standing, "group"),
);
// `can` is the caller's authority and `enabled` adds what the group's state admits.
// @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
const { can, enabled, availableActions } = useCapabilities(group);

/** The state's answer as the Overview tab takes it: a list, or null when unanswered. */
const availableActionList = computed(() =>
  availableActions.value ? [...availableActions.value] : null,
);

const showMembers = computed(() => can("view_members"));
const showDescendants = computed(() => can("view_descendants"));

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

  if (can("view_invitations")) {
    fetchers.push(
      GroupService.listInvitations(props.id, { status: "PENDING", limit: 1 })
        .then((r) => {
          counts.value.invitations = r.data.metadata.total;
        })
        .catch(() => {}),
    );
  }

  fetchers.push(
    DatasetService.search({ limit: 0, owner_group_id: props.id })
      .then((r) => {
        counts.value.datasets = r.data.metadata.total;
      })
      .catch(() => {}),
  );

  fetchers.push(
    CollectionService.search({ owner_group_id: props.id, limit: 0 })
      .then((r) => {
        counts.value.collections = r.data.metadata.total;
      })
      .catch(() => {}),
  );

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

/**
 * The badge counts what is outstanding, so it asks for PENDING regardless of which filter the
 * tab is showing. The tab emits its own total too, and either may arrive first.
 */
function handleInvitationsUpdate(total) {
  if (typeof total === "number") {
    counts.value.invitations = total;
    return;
  }
  if (can("view_invitations")) {
    GroupService.listInvitations(props.id, { status: "PENDING", limit: 1 })
      .then((r) => {
        counts.value.invitations = r.data.metadata.total;
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

function handleDatasetsUpdate() {
  DatasetService.search({ owner_group_id: props.id, limit: 0 })
    .then((r) => {
      counts.value.datasets = r.data.metadata.total;
    })
    .catch(() => {});
}

function handleCollectionsUpdate() {
  CollectionService.search({ owner_group_id: props.id, limit: 0 })
    .then((r) => {
      counts.value.collections = r.data.metadata.total;
    })
    .catch(() => {});
}

// ── Archive ───────────────────────────────────────────────────────────────
const archiveModal = ref(null);

function openArchiveModal() {
  archiveModal.value?.show();
}

async function handleUpdate() {
  await fetchGroupData();
}

function handleActionRequested(payload) {
  // Switch to the requested tab
  activeTab.value = payload.tabName;

  // The add-member modal belongs to the page, so it opens whether or not the tab it is
  // named after has rendered. The collection action still reaches into its tab, which is
  // safe only because the tab it switches to is the one that owns it.
  if (payload.modalName === "add-member") {
    openAddMemberModal();
    return;
  }

  // Open the modal after DOM has rendered the new tab
  nextTick(() => {
    if (payload.modalName === "create-collection" && collectionsTabRef.value) {
      collectionsTabRef.value?.navigateToCreateCollection?.();
    } else if (payload.modalName === "create-subgroup") {
      subgroupsTabRef.value?.openCreateModal?.();
    }
  });
}

onMounted(() => fetchGroupData());
</script>

<route lang="yaml">
meta:
  title: Group Detail
</route>
