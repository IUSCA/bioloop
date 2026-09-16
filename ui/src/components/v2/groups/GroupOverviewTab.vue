<template>
  <div class="flex flex-col gap-4">
    <!-- Summary band -->
    <OverviewBand>
      <OverviewFact label="Status">
        <Badge :color="props.group.is_archived ? 'neutral' : 'success'">
          {{ props.group.is_archived ? "Archived" : "Active" }}
        </Badge>
      </OverviewFact>

      <OverviewFact v-if="props.group.profile_visibility" label="Profile">
        <ProfileVisibilityBadge :visibility="props.group.profile_visibility" />
      </OverviewFact>

      <OverviewFact v-if="showsMemberUploads" label="Member uploads">
        <!--
          The value is the control for a caller who may change it, because a setting whose
          only edit path is a modal two clicks away gets read as a fact about the world.
        -->
        <button
          v-if="props.canEdit"
          type="button"
          class="flex items-center gap-1.5 p-0 text-xs-plus font-medium text-left bg-transparent border-0 cursor-pointer text-inherit hover:underline"
          title="Change whether members may add datasets to this group"
          @click="openEditModal"
        >
          <MemberUploadsValue :allowed="props.group.allow_user_contributions" />
          <i-mdi-pencil-outline
            class="text-xs opacity-50"
            style="color: var(--va-secondary)"
          />
        </button>
        <MemberUploadsValue
          v-else
          :allowed="props.group.allow_user_contributions"
        />
      </OverviewFact>

      <OverviewFact v-if="props.group.created_at" label="Created">
        {{ datetime.date(props.group.created_at) }}
      </OverviewFact>
    </OverviewBand>

    <div
      class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start"
    >
      <!-- Wide panel: what this group is -->
      <div class="flex flex-col gap-4">
        <OverviewAttention :items="attentionItems" />

        <ProfileAbout :about-md="props.group.about_md" />
        <ProfilePrompt
          v-if="profileIsEmpty"
          kind="group"
          :can-write="props.canEdit"
          @write="openProfileModal"
        />
        <ProfilePublications
          :publications="props.group.metadata?.publications"
        />

        <!--
          Two columns whether or not there is an ancestry card, so a root group's admins
          card keeps the width it has everywhere else instead of stretching to the panel.
        -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <VaCard>
            <VaCardContent>
              <h2 class="v2-card-title mb-3">Admins</h2>
              <div
                v-if="props.group.admins?.length"
                class="flex flex-col gap-3"
              >
                <div
                  v-for="admin in props.group.admins"
                  :key="admin.id"
                  class="flex items-center gap-2.5 min-w-0"
                >
                  <UserAvatar :username="admin.username" :name="admin.name" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium truncate">
                      {{ admin.name ?? admin.username }}
                    </p>
                    <p
                      v-if="admin.email"
                      class="text-xs font-mono truncate"
                      style="color: var(--va-secondary)"
                    >
                      {{ admin.email }}
                    </p>
                  </div>
                </div>
              </div>
              <p v-else class="text-sm" style="color: var(--va-secondary)">
                No admins found.
              </p>
            </VaCardContent>
          </VaCard>

          <!--
            A tree rather than a breadcrumb, because group names are long enough that a
            horizontal path of three of them does not fit on one row. A root group gets no
            card at all; there is no lineage to report.
          -->
          <VaCard v-if="sortedAncestors.length">
            <VaCardContent>
              <div class="flex items-center gap-1.5 mb-3">
                <h2 class="v2-card-title">Ancestry</h2>
                <span
                  class="inline-flex cursor-help"
                  title="Admins of ancestor groups have oversight visibility over this group and its resources. They cannot modify governance settings."
                >
                  <i-mdi-information-outline
                    class="text-sm"
                    style="color: var(--va-secondary)"
                  />
                </span>
              </div>
              <div class="flex flex-col text-sm">
                <div
                  v-for="item in treeItems"
                  :key="item.isCurrent ? 'current' : item.id"
                  class="flex items-start leading-6"
                  :style="{
                    paddingLeft:
                      item.level === 0 ? '0' : `${(item.level - 1) * 1.25}rem`,
                  }"
                >
                  <span
                    v-if="item.level > 0"
                    class="mr-1 select-none font-mono shrink-0"
                    style="color: var(--va-secondary)"
                    >└──</span
                  >
                  <RouterLink
                    v-if="!item.isCurrent"
                    :to="`/v2/groups/${item.id}`"
                    class="hover:underline"
                    style="color: var(--va-primary)"
                  >
                    {{ item.name }}
                  </RouterLink>
                  <span v-else class="font-semibold">{{ item.name }}</span>
                </div>
              </div>
            </VaCardContent>
          </VaCard>
        </div>
      </div>

      <!-- Thin panel: what the caller can do, and how to refer to this group -->
      <div class="flex flex-col gap-4">
        <OverviewActions :actions="quickActions" />
        <ProfileLinks :links="props.group.metadata?.links" />
        <ProfileCitation :citation="props.group.citation" kind="group" />
      </div>
    </div>
  </div>

  <GroupEditMetadataModal
    ref="editModalRef"
    :group-id="props.group.id"
    :name="props.group.name"
    :allow-user-contributions="props.group.allow_user_contributions"
    :version="props.group.version"
    @update="emit('update')"
  />

  <EditProfileModal
    v-if="props.canEdit"
    ref="profileModalRef"
    kind="group"
    :id="props.group.id"
    :name="props.group.name"
    :version="props.group.version"
    :tagline="props.group.tagline"
    :about-md="props.group.about_md"
    :profile-visibility="props.group.profile_visibility"
    :metadata="props.group.metadata"
    :avatar-key="props.group.avatar_key"
    @update="emit('update')"
  />
</template>

<script setup>
import EditProfileModal from "@/components/v2/profiles/EditProfileModal.vue";
import ProfileAbout from "@/components/v2/profiles/ProfileAbout.vue";
import ProfileCitation from "@/components/v2/profiles/ProfileCitation.vue";
import ProfileLinks from "@/components/v2/profiles/ProfileLinks.vue";
import ProfilePublications from "@/components/v2/profiles/ProfilePublications.vue";
import ProfileVisibilityBadge from "@/components/v2/profiles/ProfileVisibilityBadge.vue";
import * as datetime from "@/services/datetime";
import { getIcon } from "@/services/v2/icons";

/**
 * The Overview tab of a group: a summary band over a wide panel and a thin one.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  group: { type: Object, required: true },
  ancestors: { type: Array, default: () => [] },
  /** counts.members / counts.subgroups / counts.invitations — null while loading */
  counts: { type: Object, default: () => ({}) },
  canEdit: { type: Boolean, default: false },
  canArchive: { type: Boolean, default: false },
  canUnarchive: { type: Boolean, default: false },
  canAddMember: { type: Boolean, default: false },
  canCreateSubgroup: { type: Boolean, default: false },
  canCreateCollection: { type: Boolean, default: false },
  /**
   * `_meta.available_actions`: what the group's own state admits right now, or null when the
   * response did not say. One prop rather than a boolean per action, because the state answer
   * is one list and splitting it up invites the two halves to disagree.
   */
  availableActions: { type: Array, default: null },
});

const emit = defineEmits(["toggle-archive", "update", "action-requested"]);

/**
 * Whether the group's state admits the action.
 *
 * A null list means the response did not answer, and every control stays usable: the service
 * checks the state again under its own lock, so a wrongly enabled control costs a 409 rather
 * than a wrong write.
 */
function stateAdmits(action) {
  return props.availableActions === null
    ? true
    : props.availableActions.includes(action);
}

/** The words a disabled control shows for why the state withholds it. */
const ARCHIVED_REASON = "This group is archived.";

/**
 * Whether the band shows the member-uploads cell.
 *
 * The API's attribute filter decides: a caller who is not a member of the group never
 * receives `allow_user_contributions`, so the cell disappears without the UI running a
 * permission check of its own.
 */
const showsMemberUploads = computed(
  () => props.group.allow_user_contributions != null,
);

// sorted from root (highest depth) → nearest parent
const sortedAncestors = computed(() =>
  [...props.ancestors].sort((a, b) => b.depth - a.depth),
);

// flat list for tree rendering: each ancestor + current group as the leaf
const treeItems = computed(() => [
  ...sortedAncestors.value.map((ancestor, i) => ({
    ...ancestor,
    level: i,
    isCurrent: false,
  })),
  {
    id: null,
    name: props.group.name,
    level: sortedAncestors.value.length,
    isCurrent: true,
  },
]);

/**
 * Whether anything an admin wrote is present. The citation is excluded, because the API
 * always resolves one — a generated citation is not evidence that somebody wrote a profile.
 */
const profileIsEmpty = computed(
  () =>
    !props.group.about_md?.trim() &&
    !props.group.tagline &&
    !props.group.metadata?.links?.length &&
    !props.group.metadata?.publications?.length,
);

/**
 * What is waiting on this caller. `counts.invitations` is already the pending-only total,
 * and the page fetches it only for a caller who may view invitations, so a non-zero value
 * here always means work this caller can do.
 */
const attentionItems = computed(() => {
  const items = [];
  if (props.counts.invitations > 0) {
    items.push({
      icon: "mdi-email-outline",
      count: props.counts.invitations,
      label:
        props.counts.invitations === 1
          ? "invitation awaiting reply"
          : "invitations awaiting reply",
      onClick: () => emitAction("view-invitations", "invitations", null),
    });
  }
  return items;
});

const quickActions = computed(() => {
  const actions = [];
  if (props.canAddMember) {
    actions.push({
      icon: "mdi-account-plus",
      label: "Add a member",
      disabled: !stateAdmits("add_member"),
      disabledReason: ARCHIVED_REASON,
      onClick: () => emitAction("add-member", "members", "add-member"),
    });
  }
  if (props.canCreateSubgroup) {
    actions.push({
      icon: "mdi-sitemap-outline",
      label: "Create a subgroup",
      disabled: !stateAdmits("create_child"),
      disabledReason: ARCHIVED_REASON,
      onClick: () =>
        emitAction("create-subgroup", "subgroups", "create-subgroup"),
    });
  }
  if (props.canCreateCollection) {
    actions.push({
      icon: getIcon("collection", { outlined: true }),
      label: "Create a collection",
      disabled: !stateAdmits("add_collection"),
      disabledReason: ARCHIVED_REASON,
      onClick: () =>
        emitAction("create-collection", "collections", "create-collection"),
    });
  }
  if (props.canEdit) {
    actions.push({
      icon: "mdi-card-account-details-outline",
      label: "Edit profile",
      disabled: !stateAdmits("edit_metadata"),
      disabledReason: ARCHIVED_REASON,
      onClick: openProfileModal,
    });
    actions.push({
      icon: "mdi-pencil",
      label: "Edit name",
      disabled: !stateAdmits("edit_metadata"),
      disabledReason: ARCHIVED_REASON,
      onClick: openEditModal,
    });
  }
  // Which way the toggle points is the state's answer, not the column's. The two are the
  // same fact today, and reading the answer keeps them from drifting apart: an archived
  // group whose state withholds `unarchive` offers nothing here rather than a control that
  // fails.
  if (props.canUnarchive) {
    actions.push({
      icon: "mdi-archive-arrow-up-outline",
      label: "Unarchive this group",
      danger: true,
      onClick: () => emit("toggle-archive"),
    });
  } else if (props.canArchive) {
    actions.push({
      icon: "mdi-archive-outline",
      label: "Archive this group",
      danger: true,
      onClick: () => emit("toggle-archive"),
    });
  }
  return actions;
});

const editModalRef = ref(null);
function openEditModal() {
  editModalRef.value?.show();
}

const profileModalRef = ref(null);
function openProfileModal() {
  profileModalRef.value?.show();
}

function emitAction(actionName, tabName, modalName) {
  emit("action-requested", { actionName, tabName, modalName });
}
</script>
