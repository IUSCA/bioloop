<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 items-start">
    <!-- Left column -->
    <div class="flex flex-col gap-4">
      <VaCard>
        <VaCardContent>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold">COLLECTION DETAILS</h2>
          </div>

          <dl
            class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800"
          >
            <div class="py-2.5 flex items-center gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Name
              </dt>
              <dd class="text-sm text-gray-800 dark:text-gray-200">
                {{ props.collection.name }}
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Description
              </dt>
              <dd class="text-sm line-clamp-2">
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
                <ModernChip
                  :color="props.collection.is_archived ? 'accent' : 'success'"
                >
                  {{ props.collection.is_archived ? "Archived" : "Active" }}
                </ModernChip>
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

    <!-- Right column: stats -->
    <div class="flex flex-col gap-6">
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
          label="Requests"
          :icon="getIcon('request', { outlined: true })"
          color="info"
          :value="props.counts.requests"
          :loading="props.counts.requests === null"
        />

        <MetricCard
          label="Grants"
          :icon="getIcon('grant', { outlined: true })"
          color="warning"
          :value="props.counts.grants"
          :loading="props.counts.grants === null"
        />
      </div>

      <!-- Quick Actions -->
      <div>
        <h2 class="text-sm font-semibold mb-3 va-text-secondary">
          QUICK ACTIONS
        </h2>
        <div class="grid grid-cols-2 gap-3">
          <ActionButton
            v-if="props.canIssueGrants"
            icon="mdi-key"
            icon-color="text-amber-500"
            title="Grant Access"
            description="Issue a grant"
            hover-theme="blue"
            @click="emitAction('grant-access', 'grants', 'issue-grants')"
          />

          <ActionButton
            icon="mdi-pencil"
            icon-color="text-blue-500"
            title="Edit Details"
            description="Update metadata"
            hover-theme="blue"
            @click="openEditModal"
          />

          <ActionButton
            :icon="getIcon('dataset', { outlined: true })"
            icon-color="text-emerald-500"
            title="Add Dataset"
            description="Add a dataset to this collection"
            hover-theme="blue"
            @click="emitAction('add-dataset', 'datasets', 'add-dataset')"
          />
        </div>
      </div>
    </div>
  </div>

  <CollectionEditMetadataModal
    ref="editModalRef"
    :collection-id="props.collection.id"
    :name="props.collection.name"
    :description="props.collection.description"
    :version="props.collection.version"
    @update="emit('update')"
  />
</template>

<script setup>
import CollectionEditMetadataModal from "@/components/v2/collections/CollectionEditMetadataModal.vue";

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
});

const emit = defineEmits(["update", "toggle-archive", "action-requested"]);

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

function openArchiveModal() {
  emit("toggle-archive");
}
</script>
