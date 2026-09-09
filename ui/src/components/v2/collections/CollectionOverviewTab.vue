<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 items-start">
    <!-- Left column: the profile, which is what this tab is for -->
    <div class="flex flex-col gap-4">
      <ProfileAbout :about-md="props.collection.about_md" />
      <ProfileCitation
        :citation="props.collection.citation"
        kind="collection"
      />
      <ProfilePublications
        :publications="props.collection.metadata?.publications"
      />

      <VaCard v-if="profileIsEmpty">
        <VaCardContent
          class="py-8 text-center flex flex-col items-center gap-2"
        >
          <Icon
            icon="mdi-card-account-details-outline"
            class="text-3xl"
            style="color: var(--va-secondary)"
          />
          <p class="text-sm font-medium">This collection has no profile yet</p>
          <p class="text-sm max-w-md" style="color: var(--va-secondary)">
            A profile says what the collection holds and how to cite it. It
            stays private until you publish it.
          </p>
          <VaButton
            v-if="props.canEdit"
            size="small"
            class="mt-2"
            @click="openProfileModal"
          >
            Write a profile
          </VaButton>
        </VaCardContent>
      </VaCard>

      <VaCard
        v-if="props.canArchive || props.canUnarchive"
        class="border border-solid border-red-200 dark:border-red-800"
      >
        <VaCardContent>
          <h2 class="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
            Danger Zone
          </h2>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium">
                {{
                  props.collection.is_archived
                    ? "Unarchive this collection"
                    : "Archive this collection"
                }}
              </p>
              <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                {{
                  props.collection.is_archived
                    ? "Unfreezes datasets and restores edit access."
                    : "Freezes datasets and blocks new changes."
                }}
              </p>
            </div>
            <VaButton color="danger" size="small" @click="openArchiveModal">
              {{ props.collection.is_archived ? "Unarchive" : "Archive" }}
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Right column -->
    <div class="flex flex-col gap-4">
      <!-- Stat cards (2×2 grid) -->
      <div class="grid grid-cols-2 gap-3">
        <MetricCard
          label="Datasets"
          :icon="getIcon('dataset', { outlined: true })"
          color="success"
          :value="props.counts.datasets"
          :loading="props.counts.datasets === null"
        />

        <MetricCard
          :label="props.canReview ? 'Pending Requests' : 'My Requests'"
          :icon="getIcon('request', { outlined: true })"
          color="info"
          :value="props.counts.requests"
          :loading="props.counts.requests === null"
        />

        <MetricCard
          :label="props.canIssueGrants ? 'Access' : 'My Access'"
          :icon="getIcon('grant', { outlined: true })"
          color="warning"
          :value="props.counts.grants"
          :loading="props.counts.grants === null"
        />
      </div>

      <ProfileLinks :links="props.collection.metadata?.links" />

      <!--
        The definition list that used to be the whole tab. It keeps its content and gives
        up the main column to the profile.
      -->
      <VaCard>
        <VaCardContent>
          <h2 class="text-sm font-semibold mb-1">DETAILS</h2>

          <dl
            class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800"
          >
            <div class="py-2.5 flex items-start gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Description
              </dt>
              <dd class="text-sm">
                {{ props.collection.description || "—" }}
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Owner group
              </dt>
              <dd class="text-sm font-semibold">
                <RouterLink
                  v-if="props.collection.owner_group"
                  :to="`/v2/groups/${props.collection.owner_group.id}`"
                >
                  <div class="flex items-center gap-2">
                    {{ props.collection.owner_group?.name || "—" }}
                  </div>
                </RouterLink>
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Status
              </dt>
              <dd>
                <Badge
                  :color="props.collection.is_archived ? 'neutral' : 'success'"
                >
                  {{ props.collection.is_archived ? "Archived" : "Active" }}
                </Badge>
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Profile
              </dt>
              <dd>
                <ProfileVisibilityBadge
                  :visibility="props.collection.profile_visibility"
                />
              </dd>
            </div>

            <div
              v-if="props.collection.created_at"
              class="py-2.5 flex items-center gap-4"
            >
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Created
              </dt>
              <dd class="text-sm">
                {{ datetime.displayDateTime(props.collection.created_at) }}
              </dd>
            </div>

            <div
              v-if="props.collection.created_at"
              class="py-2.5 flex items-center gap-4"
            >
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Updated
              </dt>
              <dd class="text-sm">
                {{ datetime.fromNow(props.collection.updated_at) }}
              </dd>
            </div>
          </dl>
        </VaCardContent>
      </VaCard>

      <!-- Quick Actions -->
      <div>
        <h2 class="text-sm font-semibold mb-3 va-text-secondary">
          QUICK ACTIONS
        </h2>
        <div class="grid grid-cols-2 gap-3">
          <ActionButton
            v-if="props.canEdit"
            icon="mdi-card-account-details-outline"
            icon-color="text-blue-500"
            title="Edit Profile"
            description="About, links, citation, visibility"
            hover-theme="blue"
            @click="openProfileModal"
          />

          <ActionButton
            v-if="props.canIssueGrants"
            icon="mdi-key"
            icon-color="text-amber-500"
            title="Grant Access"
            description="Grant access to users or groups"
            hover-theme="blue"
            @click="emitAction('grant-access', 'grants', 'issue-grants')"
          />

          <ActionButton
            v-if="props.canEdit"
            icon="mdi-pencil"
            icon-color="text-blue-500"
            title="Edit Details"
            description="Update metadata"
            hover-theme="blue"
            @click="openEditModal"
          />

          <ActionButton
            v-if="props.canAddDataset"
            :icon="getIcon('dataset', { outlined: true })"
            icon-color="text-emerald-500"
            title="Add Dataset"
            description="Add a dataset to this collection"
            hover-theme="blue"
            @click="emitAction('add-dataset', 'datasets', 'add-dataset')"
          />

          <ActionButton
            icon="mdi-account-question"
            icon-color="text-indigo-500"
            title="Request Access"
            description="Submit a request to access this collection"
            hover-theme="blue"
            @click="emitAction('request-access', 'requests', 'request-access')"
          />
        </div>
      </div>
    </div>
  </div>

  <CollectionEditMetadataModal
    v-if="props.canEdit"
    ref="editModalRef"
    :collection-id="props.collection.id"
    :name="props.collection.name"
    :description="props.collection.description"
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

const props = defineProps({
  collection: { type: Object, required: true },
  counts: {
    type: Object,
    default: () => ({ datasets: null }),
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

function emitAction(actionName, tabName, modalName) {
  emit("action-requested", {
    actionName,
    tabName,
    modalName,
  });
}

const editModalRef = ref(null);
function openEditModal() {
  editModalRef.value?.show();
}

const profileModalRef = ref(null);
function openProfileModal() {
  profileModalRef.value?.show();
}

function openArchiveModal() {
  emit("toggle-archive");
}
</script>
