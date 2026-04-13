<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 items-start">
    <!-- Left column -->
    <div class="flex flex-col gap-4">
      <VaCard>
        <VaCardContent>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold">DATASET DETAILS</h2>
          </div>

          <dl
            class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800"
          >
            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Name
              </dt>
              <dd class="text-sm text-gray-800 dark:text-gray-200">
                {{ props.dataset.name }}
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Type
              </dt>
              <dd>
                <ModernChip size="small" outline class="capitalize">
                  <DatasetType :type="props.dataset.type" />
                </ModernChip>
              </dd>
            </div>

            <!-- status: is_deleted -->
            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Status
              </dt>
              <dd>
                <ModernChip
                  v-if="props.dataset.is_deleted"
                  color="accent"
                  size="small"
                >
                  Deleted
                </ModernChip>
                <ModernChip v-else color="success" size="small">
                  Active
                </ModernChip>
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Description
              </dt>
              <dd class="text-sm line-clamp-2">
                {{ props.dataset.description || "—" }}
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Owner Group
              </dt>
              <dd class="text-sm font-semibold">
                <RouterLink
                  v-if="props.dataset.owner_group"
                  :to="`/v2/groups/${props.dataset.owner_group.id}`"
                >
                  {{ props.dataset.owner_group?.name || "—" }}
                </RouterLink>
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Size
              </dt>
              <dd class="text-sm">{{ formatBytes(props.dataset.size) }}</dd>
            </div>

            <div
              v-if="props.dataset.created_at"
              class="py-2.5 flex items-center gap-4"
            >
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Created
              </dt>
              <dd class="text-sm">
                {{ datetime.displayDateTime(props.dataset.created_at) }}
              </dd>
            </div>

            <div
              v-if="props.dataset.updated_at"
              class="py-2.5 flex items-center gap-4"
            >
              <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
                Updated
              </dt>
              <dd class="text-sm">
                {{ datetime.fromNow(props.dataset.updated_at) }}
              </dd>
            </div>
          </dl>
        </VaCardContent>
      </VaCard>

      <VaCard
        v-if="props.canArchive && !props.dataset.is_deleted"
        class="border border-solid border-red-200 dark:border-red-800"
      >
        <VaCardContent>
          <h2 class="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
            Danger Zone
          </h2>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Delete this dataset</p>
              <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                This action is irreversible and will delete the dataset while
                retaining metadata.
              </p>
            </div>
            <VaButton color="danger" size="small" @click="openDeleteModal">
              Delete
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Right: Stats & Actions -->
    <div class="flex flex-col gap-4">
      <!-- Stat Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="Files"
          icon="mdi-file-multiple"
          :value="props.dataset.num_files"
          :loading="false"
        />
        <MetricCard
          label="Grants"
          icon="mdi-key"
          :value="props.counts.grants"
          :loading="props.canIssueGrants && props.counts.grants === null"
        />
        <MetricCard
          label="Workflows"
          icon="mdi-map-marker-path"
          :value="props.counts.workflows"
          :loading="props.counts.workflows === null"
        />
        <MetricCard
          label="Requests"
          icon="mdi-clipboard-list"
          :value="props.counts.requests"
          :loading="props.counts.requests === null"
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

          <!-- emitAction('download', 'files', 'download') -->
          <ActionButton
            v-if="props.canDownload"
            icon="mdi-download"
            icon-color="text-emerald-500"
            title="Download"
            description="Download dataset files"
            hover-theme="blue"
            @click="openDownloadModal"
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
            v-if="props.canDownload"
            :disabled="props.dataset.is_staged"
            icon="mdi-cloud-download"
            icon-color="text-blue-500"
            title="Request Stage"
            description="Request dataset staging"
            hover-theme="blue"
            @click="handleStageRequest"
          />
        </div>
      </div>
    </div>
  </div>

  <DatasetEditMetadataModal
    ref="editModalRef"
    :dataset-id="props.dataset.resource_id"
    :name="props.dataset.name"
    :description="props.dataset.description"
    @update="emit('update')"
  />
</template>

<script setup>
import DatasetType from "@/components/dataset/DatasetType.vue";
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import DatasetEditMetadataModal from "./DatasetEditMetadataModal.vue";

const props = defineProps({
  dataset: { type: Object, required: true },
  counts: {
    type: Object,
    default: () => ({ grants: null, requests: null, workflows: null }),
  },
  canEdit: { type: Boolean, default: false },
  canArchive: { type: Boolean, default: false },
  canIssueGrants: { type: Boolean, default: false },
  canDownload: { type: Boolean, default: false },
});

const emit = defineEmits(["update", "delete", "action-requested"]);

const editModalRef = ref(null);

function openEditModal() {
  editModalRef.value?.show();
}

function emitAction(actionName, tabName, modalName) {
  emit("action-requested", {
    actionName,
    tabName,
    modalName,
  });
}

function openDeleteModal() {
  emit("delete");
}

const downloadModalRef = ref(null);
function openDownloadModal() {
  downloadModalRef.value?.show();
}

function handleStageRequest() {
  console.log("Stage request clicked");
}
</script>
