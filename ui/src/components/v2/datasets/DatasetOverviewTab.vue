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
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Name
              </dt>
              <dd class="text-base text-gray-800 dark:text-gray-200">
                {{ props.dataset.name }}
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Type
              </dt>
              <dd>
                <Badge>
                  <DatasetType :type="props.dataset.type" />
                </Badge>
              </dd>
            </div>

            <!-- status: is_deleted -->
            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Status
              </dt>
              <dd>
                <Badge v-if="props.dataset.is_deleted" color="neutral">
                  Deleted
                </Badge>
                <Badge v-else color="success"> Active </Badge>
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Description
              </dt>
              <dd class="text-base line-clamp-2">
                {{ props.dataset.description || "—" }}
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Owner Group
              </dt>
              <dd class="text-base font-semibold">
                <RouterLink
                  v-if="props.dataset.owner_group"
                  :to="`/v2/groups/${props.dataset.owner_group.id}`"
                >
                  {{ props.dataset.owner_group?.name || "—" }}
                </RouterLink>
              </dd>
            </div>

            <div class="py-2.5 flex items-center gap-4">
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Size
              </dt>
              <dd class="text-base">
                {{ formatBytes(props.dataset.size) || "—" }}
              </dd>
            </div>

            <div
              v-if="props.dataset.created_at"
              class="py-2.5 flex items-center gap-4"
            >
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Created
              </dt>
              <dd class="text-base">
                {{ datetime.displayDateTime(props.dataset.created_at) }}
              </dd>
            </div>

            <div
              v-if="props.dataset.updated_at"
              class="py-2.5 flex items-center gap-4"
            >
              <dt class="w-28 shrink-0 text-sm font-medium va-text-secondary">
                Updated
              </dt>
              <dd class="text-base">
                {{ datetime.fromNow(props.dataset.updated_at) }}
              </dd>
            </div>
          </dl>
        </VaCardContent>
      </VaCard>

      <VaCard
        v-if="props.canDelete"
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
            <VaButton
              color="danger"
              size="small"
              :disabled="!stateAdmits('delete')"
              :title="stateAdmits('delete') ? null : ARCHIVED_REASON"
              @click="openDeleteModal"
            >
              Delete
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Right: Stats & Actions -->
    <div class="flex flex-col gap-4">
      <!-- Stat Cards. A card the caller may not see is left out rather than shown empty:
           the page never fetches that count, so it would stay a skeleton or a dash. -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <!-- counts.files is null when the caller may not list files. -->
        <MetricCard
          v-if="props.counts.files != null"
          label="Files"
          icon="mdi-file-multiple"
          :value="props.counts.files"
          :loading="false"
        />
        <MetricCard
          v-if="props.canIssueGrants"
          label="Access"
          icon="mdi-key"
          :value="props.counts.grants"
          :loading="props.counts.grants === null"
        />
        <MetricCard
          v-if="props.canViewWorkflows"
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
        <MetricCard
          v-if="props.canViewSourceDatasets"
          label="Sources"
          icon="mdi-source-branch"
          :value="props.counts.sourceDatasets"
          :loading="props.counts.sourceDatasets === null"
        />
        <MetricCard
          v-if="props.canViewDerivedDatasets"
          label="Derivatives"
          icon="mdi-source-merge"
          :value="props.counts.derivedDatasets"
          :loading="props.counts.derivedDatasets === null"
        />
      </div>

      <!-- Staging status.
           Two audiences. Someone who can open the Workflows tab sees the runs still going.
           A grant holder cannot open that tab — a run carries paths and error traces — so
           they get the one fact they need, derived from the dataset itself.
           @see .todo/issues/06-dataset-actions-workflows.md — Who sees the tab -->
      <div v-if="activeRuns.length || stageNotice">
        <h2 class="text-sm font-semibold mb-3 va-text-secondary">STATUS</h2>

        <div
          v-for="run in activeRuns"
          :key="run.id"
          class="flex items-center gap-2 text-sm mb-1"
        >
          <VaIcon name="mdi-progress-clock" class="text-blue-500" />
          <span class="capitalize">{{ run.name }}</span>
          <span class="va-text-secondary">{{ run.status?.toLowerCase() }}</span>
        </div>

        <div v-if="stageNotice" class="flex items-center gap-2 text-sm">
          <VaIcon :name="stageNotice.icon" :class="stageNotice.color" />
          <span>{{ stageNotice.text }}</span>
        </div>
      </div>

      <!-- Quick Actions. The heading goes with the grid: a deleted dataset hides every
           mutating and data control, and a lone heading over an empty grid reads as a page
           that failed to load rather than as a dataset with nothing left to do. -->
      <div v-if="showsQuickActions">
        <h2 class="text-sm font-semibold mb-3 va-text-secondary">
          QUICK ACTIONS
        </h2>
        <div class="grid grid-cols-2 gap-3">
          <ActionButton
            v-if="props.canIssueGrants"
            :disabled="!stateAdmits('manage_grants')"
            icon="mdi-key"
            icon-color="text-amber-500"
            title="Give Access"
            :description="
              stateAdmits('manage_grants')
                ? 'Give access to users or groups'
                : ARCHIVED_REASON
            "
            hover-theme="blue"
            @click="emitAction('grant-access', 'grants', 'issue-grants')"
          />

          <!-- The counterpart of Grant Access, as on the collection Overview. -->
          <ActionButton
            v-if="props.canRequestAccess && !props.canIssueGrants"
            icon="mdi-account-question"
            icon-color="text-emerald-500"
            title="Request Access"
            description="Ask for more access"
            hover-theme="blue"
            @click="emitAction('request-access', 'requests', 'request-access')"
          />

          <!-- emitAction('download', 'files', 'download') -->
          <!-- Downloading survives archiving: the bytes stay readable, and only a deletion
               stops them, which the page hides this control for. -->
          <ActionButton
            v-if="props.canDownload"
            :disabled="!stateAdmits('download')"
            icon="mdi-download"
            icon-color="text-emerald-500"
            title="Download"
            description="Download dataset files"
            hover-theme="blue"
            @click="openDownloadModal"
          />

          <ActionButton
            v-if="props.canEdit"
            :disabled="!stateAdmits('edit_metadata')"
            icon="mdi-pencil"
            icon-color="text-blue-500"
            title="Edit Details"
            :description="
              stateAdmits('edit_metadata') ? 'Update metadata' : ARCHIVED_REASON
            "
            hover-theme="blue"
            @click="openEditModal"
          />

          <ActionButton
            v-if="props.canRequestStage"
            :disabled="
              props.dataset.is_staged ||
              staging ||
              !stateAdmits('request_stage')
            "
            :loading="staging"
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

  <!-- Download Modal -->
  <DatasetDownloadModalV2
    ref="downloadModalRef"
    :dataset="props.dataset"
    @navigate-to-files="handleNavigateToFiles"
  />
</template>

<script setup>
import DatasetType from "@/components/dataset/DatasetType.vue";
import datasetService from "@/services/v2/datasets";
import toast from "@/services/toast";
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
  canDelete: { type: Boolean, default: false },
  canIssueGrants: { type: Boolean, default: false },
  // `request_access`: filing a request on this dataset would be accepted.
  canRequestAccess: { type: Boolean, default: false },
  canDownload: { type: Boolean, default: false },
  // Staging is its own authority. Being able to download a dataset that is already staged
  // does not imply being able to ask for it to be staged again.
  canRequestStage: { type: Boolean, default: false },
  // Whether the viewer may open the Workflows tab. Decides which of the two status views
  // below they get.
  canViewWorkflows: { type: Boolean, default: false },
  canViewSourceDatasets: { type: Boolean, default: false },
  canViewDerivedDatasets: { type: Boolean, default: false },
  /**
   * `_meta.available_actions`: what the dataset's own state admits right now, or null when the
   * response did not say. One prop rather than a boolean per action, because the state answer
   * is one list and splitting it up invites the two halves to disagree.
   */
  availableActions: { type: Array, default: null },
});

const emit = defineEmits([
  "update",
  "delete",
  "action-requested",
  "navigate-to-files",
]);

/**
 * Whether the dataset's state admits the action.
 *
 * A null list means the response did not answer, and every control stays usable: the service
 * checks the state again under its own lock, so a wrongly enabled control costs a 409 rather
 * than a wrong write.
 *
 * The page hides these controls outright on a deleted dataset, where no state can readmit
 * them. What reaches here is the reversible case, an archived owning group, which disables.
 *
 * `request_access` never passes through: the API derives that capability and folds the state
 * check into it, so the state list does not name it.
 */
function stateAdmits(action) {
  return props.availableActions === null
    ? true
    : props.availableActions.includes(action);
}

/** The words a disabled control shows for why the state withholds it. */
const ARCHIVED_REASON = "This dataset's owning group is archived.";

/**
 * Whether any quick action will render at all.
 *
 * Each control below is gated on its own prop, and the page withholds those it hides on a
 * deleted dataset, so all five can be false at once.
 */
const showsQuickActions = computed(
  () =>
    props.canIssueGrants ||
    props.canRequestAccess ||
    props.canDownload ||
    props.canEdit ||
    props.canRequestStage,
);

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

const staging = ref(false);
const requested = ref(false);
const activeRuns = ref([]);

const DONE = ["SUCCESS", "FAILURE", "REVOKED"];

// A grant holder sees this instead of the runs. "requested" comes from local state right
// after the click; "ready" comes from `is_staged`, which the dataset attribute filters send
// to every caller who may view the dataset at all.
const stageNotice = computed(() => {
  if (props.canViewWorkflows) return null;
  if (requested.value && !props.dataset.is_staged) {
    return {
      icon: "mdi-progress-clock",
      color: "text-blue-500",
      text: "Staging requested. This page will show it as ready once it finishes.",
    };
  }
  if (props.dataset.is_staged) {
    return {
      icon: "mdi-check-circle-outline",
      color: "text-emerald-500",
      text: "Staged and ready to download.",
    };
  }
  return null;
});

async function fetchActiveRuns() {
  if (!props.canViewWorkflows) return;
  try {
    const { data } = await datasetService.listWorkflows(
      props.dataset.resource_id,
      {
        only_active: true,
      },
    );
    activeRuns.value = (data || []).filter((run) => !DONE.includes(run.status));
  } catch {
    activeRuns.value = [];
  }
}

onMounted(fetchActiveRuns);

function handleStageRequest() {
  staging.value = true;
  datasetService
    .runWorkflow({ id: props.dataset.resource_id, workflow_type: "stage" })
    .then(() => {
      requested.value = true;
      toast.success("Staging requested.");
      fetchActiveRuns();
      emit("update");
    })
    .catch((err) => {
      // The API refuses a second stage run while one is pending; say so rather than
      // reporting a generic failure.
      const pending = err?.response?.status === 409;
      toast.error(
        pending
          ? "This dataset is already being staged."
          : "Unable to request staging",
      );
    })
    .finally(() => {
      staging.value = false;
    });
}

function handleNavigateToFiles() {
  emit("navigate-to-files");
}
</script>
