<template>
  <div class="flex flex-col gap-4">
    <!-- Summary band. The owning group is named in the page header, not repeated here. -->
    <OverviewBand>
      <OverviewFact label="Status">
        <Badge :color="props.collection.is_archived ? 'neutral' : 'success'">
          {{ props.collection.is_archived ? "Archived" : "Active" }}
        </Badge>
      </OverviewFact>

      <OverviewFact v-if="props.collection.profile_visibility" label="Profile">
        <ProfileVisibilityBadge
          :visibility="props.collection.profile_visibility"
        />
      </OverviewFact>

      <OverviewFact v-if="props.collection.created_at" label="Created">
        {{ datetime.date(props.collection.created_at) }}
      </OverviewFact>

      <OverviewFact v-if="props.collection.updated_at" label="Updated">
        {{ datetime.fromNow(props.collection.updated_at) }}
      </OverviewFact>
    </OverviewBand>

    <div
      class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start"
    >
      <!-- Wide panel: what this collection is -->
      <div class="flex flex-col gap-4">
        <OverviewAttention :items="attentionItems" />

        <ProfileAbout :about-md="props.collection.about_md" />
        <ProfilePrompt
          v-if="profileIsEmpty"
          kind="collection"
          :can-write="props.canEdit"
          @write="openProfileModal"
        />
        <ProfilePublications
          :publications="props.collection.metadata?.publications"
        />
      </div>

      <!-- Thin panel: what the caller can do, and how to refer to this collection -->
      <div class="flex flex-col gap-4">
        <OverviewActions :actions="quickActions" />
        <ProfileLinks :links="props.collection.metadata?.links" />
        <ProfileCitation
          :citation="props.collection.citation"
          kind="collection"
        />
      </div>
    </div>
  </div>

  <CollectionEditMetadataModal
    v-if="props.canEdit"
    ref="editModalRef"
    :collection-id="props.collection.id"
    :name="props.collection.name"
    :version="props.collection.version"
    @update="emit('update')"
  />

  <EditProfileModal
    v-if="props.canEdit"
    :id="props.collection.id"
    ref="profileModalRef"
    kind="collection"
    :name="props.collection.name"
    :version="props.collection.version"
    :tagline="props.collection.tagline"
    :about-md="props.collection.about_md"
    :profile-visibility="props.collection.profile_visibility"
    :metadata="props.collection.metadata"
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
 * The Overview tab of a collection: a summary band over a wide panel and a thin one, the
 * same shape the group Overview uses.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  collection: { type: Object, required: true },
  counts: {
    type: Object,
    default: () => ({ datasets: null, grants: null, requests: null }),
  },
  canEdit: { type: Boolean, default: false },
  canReview: { type: Boolean, default: false },
  canArchive: { type: Boolean, default: false },
  canUnarchive: { type: Boolean, default: false },
  canIssueGrants: { type: Boolean, default: false },
  // `request_access`: filing a request on this collection would be accepted.
  canRequestAccess: { type: Boolean, default: false },
  canAddDataset: { type: Boolean, default: false },
  /**
   * `_meta.available_actions`: what the collection's own state admits right now, or null when
   * the response did not say. One prop rather than a boolean per action, because the state
   * answer is one list and splitting it up invites the two halves to disagree.
   */
  availableActions: { type: Array, default: null },
});

const emit = defineEmits(["update", "toggle-archive", "action-requested"]);

/**
 * Whether the collection's state admits the action.
 *
 * A null list means the response did not answer, and every control stays usable: the service
 * checks the state again under its own lock, so a wrongly enabled control costs a 409 rather
 * than a wrong write.
 *
 * Only actions the state container declares can appear in the list. `request_access` is not
 * one of them — the API derives that capability and folds the state check into it — so the
 * Request access control is gated on the capability alone and never passes through here.
 */
function stateAdmits(action) {
  return props.availableActions === null
    ? true
    : props.availableActions.includes(action);
}

/** The words a disabled control shows for why the state withholds it. */
const ARCHIVED_REASON = "This collection is archived.";

/**
 * Whether the wide panel would otherwise be blank. The tagline and the links render in the
 * header and the thin panel, so only the About body and the publications fill the wide one.
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const profileIsEmpty = computed(
  () =>
    !props.collection.about_md?.trim() &&
    !props.collection.metadata?.publications?.length,
);

/**
 * What is waiting on this caller.
 *
 * `counts.requests` carries two different meanings: pending-review for a caller who may
 * review, and the caller's own requests otherwise. Only the first is work waiting on them,
 * so the row is gated on `canReview` rather than on the count alone.
 */
const attentionItems = computed(() => {
  const items = [];
  if (props.canReview && props.counts.requests > 0) {
    items.push({
      icon: getIcon("request", { outlined: true }),
      count: props.counts.requests,
      label:
        props.counts.requests === 1
          ? "access request to review"
          : "access requests to review",
      onClick: () => emitAction("review-requests", "requests", null),
    });
  }
  return items;
});

const quickActions = computed(() => {
  const actions = [];
  if (props.canAddDataset) {
    actions.push({
      icon: getIcon("dataset", { outlined: true }),
      label: "Add a dataset",
      disabled: !stateAdmits("add_dataset"),
      disabledReason: ARCHIVED_REASON,
      onClick: () => emitAction("add-dataset", "datasets", "add-dataset"),
    });
  }
  if (props.canIssueGrants) {
    actions.push({
      icon: "mdi-key",
      label: "Grant access",
      disabled: !stateAdmits("manage_grants"),
      disabledReason: ARCHIVED_REASON,
      onClick: () => emitAction("grant-access", "grants", "issue-grants"),
    });
  } else if (props.canRequestAccess) {
    actions.push({
      icon: "mdi-account-question",
      label: "Request access",
      onClick: () => emitAction("request-access", "requests", "request-access"),
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
  // collection whose state withholds `unarchive` offers nothing here rather than a control
  // that fails.
  if (props.canUnarchive) {
    actions.push({
      icon: "mdi-archive-arrow-up-outline",
      label: "Unarchive this collection",
      danger: true,
      onClick: () => emit("toggle-archive"),
    });
  } else if (props.canArchive) {
    actions.push({
      icon: "mdi-archive-outline",
      label: "Archive this collection",
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
