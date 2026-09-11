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
  canAddDataset: { type: Boolean, default: false },
});

const emit = defineEmits(["update", "toggle-archive", "action-requested"]);

/**
 * Whether anything an admin wrote is present. The citation is excluded, because the API
 * always resolves one — a generated citation is not evidence that somebody wrote a profile.
 */
const profileIsEmpty = computed(
  () =>
    !props.collection.about_md?.trim() &&
    !props.collection.tagline &&
    !props.collection.metadata?.links?.length &&
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
      onClick: () => emitAction("add-dataset", "datasets", "add-dataset"),
    });
  }
  if (props.canIssueGrants) {
    actions.push({
      icon: "mdi-key",
      label: "Grant access",
      onClick: () => emitAction("grant-access", "grants", "issue-grants"),
    });
  } else {
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
      onClick: openProfileModal,
    });
    actions.push({
      icon: "mdi-pencil",
      label: "Edit name",
      onClick: openEditModal,
    });
  }
  if (props.canArchive || props.canUnarchive) {
    actions.push({
      icon: props.collection.is_archived
        ? "mdi-archive-arrow-up-outline"
        : "mdi-archive-outline",
      label: props.collection.is_archived
        ? "Unarchive this collection"
        : "Archive this collection",
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
