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
        title="Failed to load dataset"
        :error="error"
        subject="this dataset"
        @retry="fetchDatasetData"
      />
    </div>

    <!-- Loaded -->
    <div v-else-if="dataset" data-testid="dataset-detail">
      <!-- Page header -->
      <div class="space-y-3 mt-3">
        <VaAlert v-if="dataset.is_deleted" color="warning" class="!mb-0">
          <p class="text-sm">
            This dataset has been deleted and is now read-only.
          </p>
        </VaAlert>

        <div class="flex items-center justify-start flex-wrap gap-3 lg:gap-5">
          <!-- Icon, Name, Type -->
          <div class="flex items-center gap-3">
            <Icon
              :icon="constants.icons.dataset"
              class="text-2xl shrink-0"
              style="color: var(--va-primary)"
            />
            <div class="min-w-0">
              <h1 class="text-xl font-semibold">{{ dataset.name }}</h1>
              <DatasetType
                :type="dataset.type"
                class="text-sm text-gray-600 dark:text-gray-400"
              />
            </div>
            <!-- <Badge v-if="dataset.is_deleted" color="neutral" class="ml-2">
            Deleted
          </Badge> -->
          </div>

          <!-- Owner Group -->
          <div class="flex items-center gap-1 text-sm va-text-secondary">
            <span>Owned by</span>
            <RouterLink
              v-if="dataset.owner_group?.name"
              class="max-w-md truncate font-medium"
              :to="`/v2/groups/${dataset.owner_group.id}`"
            >
              {{ dataset.owner_group.name }}
            </RouterLink>
            <span v-else> — </span>
          </div>

          <!-- Caller Role -->
          <div class="ml-auto" v-if="callerRole">
            <RoleBadge :role-name="callerRole" size="base" />
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <VaTabs
        v-model="activeTab"
        class="border-b border-solid border-blue-500/50"
      >
        <template #tabs>
          <VaTab name="overview">Overview</VaTab>
          <VaTab name="files" v-if="can('list_files')">
            <span class="flex items-center gap-1.5">
              Files
              <span v-if="counts.files !== null" class="tab-count-badge">
                {{ counts.files }}
              </span>
            </span>
          </VaTab>

          <VaTab name="source-datasets" v-if="can('view_source_datasets')">
            <span class="flex items-center gap-1.5">
              Sources
              <span
                v-if="counts.sourceDatasets !== null"
                class="tab-count-badge"
              >
                {{ counts.sourceDatasets }}
              </span>
            </span>
          </VaTab>

          <VaTab name="derived-datasets" v-if="can('view_derived_datasets')">
            <span class="flex items-center gap-1.5">
              Derivatives
              <span
                v-if="counts.derivedDatasets !== null"
                class="tab-count-badge"
              >
                {{ counts.derivedDatasets }}
              </span>
            </span>
          </VaTab>

          <VaTab name="collections" v-if="can('view_collections')">
            <span class="flex items-center gap-1.5">
              Collections
              <span v-if="counts.collections !== null" class="tab-count-badge">
                {{ counts.collections }}
              </span>
            </span>
          </VaTab>
          <VaTab name="grants">
            <span class="flex items-center gap-1.5">
              Access
              <span v-if="counts.grants !== null" class="tab-count-badge">
                {{ counts.grants }}
              </span>
            </span>
          </VaTab>
          <VaTab name="requests">
            <span class="flex items-center gap-1.5">
              Requests
              <span v-if="counts.requests !== null" class="tab-count-badge">
                {{ counts.requests }}
              </span>
            </span>
          </VaTab>
          <VaTab name="workflows" v-if="can('view_workflows')">
            <span class="flex items-center gap-1.5">
              Workflows
              <span v-if="counts.workflows !== null" class="tab-count-badge">
                {{ counts.workflows }}
              </span>
            </span>
          </VaTab>
          <!--
            Offered only for a dataset that was uploaded. The route behind it reads the
            upload log, which no other creation route writes.
          -->
          <VaTab name="upload" v-if="isUpload && can('view_workflows')"
            >Upload</VaTab
          >
          <VaTab name="audit-log" v-if="can('view_audit_logs')"
            >Audit Log</VaTab
          >
        </template>
      </VaTabs>

      <!-- Tab content -->
      <div>
        <DatasetOverviewTab
          v-if="activeTab === 'overview'"
          :dataset="dataset"
          :counts="counts"
          :can-edit="shows('edit_metadata')"
          :can-delete="shows('delete')"
          :can-issue-grants="shows('manage_grants')"
          :can-request-access="can('request_access')"
          :can-download="shows('download')"
          :can-request-stage="shows('request_stage')"
          :can-view-workflows="can('view_workflows')"
          :available-actions="availableActionList"
          :can-view-source-datasets="can('view_source_datasets')"
          :can-view-derived-datasets="can('view_derived_datasets')"
          @update="fetchDatasetData"
          @delete="openDeleteModal"
          @action-requested="handleActionRequested"
          @navigate-to-files="activeTab = 'files'"
        />

        <DatasetFilesTab
          v-else-if="activeTab === 'files'"
          :dataset="dataset"
          :can-download="enabled('download')"
        />

        <DatasetAssociatedDatasetsTab
          v-else-if="activeTab === 'source-datasets'"
          type="source"
          :dataset="dataset"
          :can-list="can('view_source_datasets')"
        />

        <DatasetAssociatedDatasetsTab
          v-else-if="activeTab === 'derived-datasets'"
          type="derived"
          :dataset="dataset"
          :can-list="can('view_derived_datasets')"
        />

        <DatasetCollectionsTab
          v-else-if="activeTab === 'collections'"
          :dataset-id="dataset.resource_id"
        />

        <DatasetGrantsTab
          ref="grantsTabRef"
          v-else-if="activeTab === 'grants' && can('manage_grants')"
          :dataset="dataset"
          :can-manage-grants="enabled('manage_grants')"
          @count-changed="fetchGrantsCount"
        />

        <!-- Every other viewer sees why they can see this dataset, never the grant table. -->
        <MyAccessTab
          v-else-if="activeTab === 'grants'"
          resource-type="DATASET"
          :resource-id="dataset.resource_id"
          :standing="dataset._meta?.standing"
        />

        <DatasetRequestsTab
          ref="requestTabRef"
          v-else-if="activeTab === 'requests'"
          :dataset="dataset"
          :can-review="enabled('review_access_requests')"
          @count-changed="fetchRequestCount"
        />

        <DatasetWorkflowsTab
          v-else-if="activeTab === 'workflows'"
          :dataset="dataset"
          :can-act="enabled('request_stage') || enabled('compute')"
          @count-changed="(n) => (counts.workflows = n)"
        />

        <DatasetUploadTab
          v-else-if="activeTab === 'upload'"
          :dataset-id="dataset.resource_id"
        />

        <DatasetAuditLogTab
          v-else-if="activeTab === 'audit-log'"
          :dataset-id="dataset.resource_id"
        />
      </div>

      <!-- Delete confirm modal -->
      <DatasetDeleteConfirmModal
        ref="deleteModal"
        :dataset-id="dataset.resource_id"
        :dataset-name="dataset.name"
        :dataset-type="dataset.type"
        @update="fetchDatasetData"
      />
    </div>
  </Transition>
</template>

<script setup>
import DatasetType from "@/components/dataset/DatasetType.vue";
import { useCapabilities } from "@/composables/useCapabilities";
import constants from "@/constants";
import AccessRequestService from "@/services/v2/access-requests";
import CollectionService from "@/services/v2/collections";
import DatasetService from "@/services/v2/datasets";
import GrantService from "@/services/v2/grants";
import { badgeFor } from "@/services/v2/standing";
import { useNavStore } from "@/stores/nav";

// const route = useRoute();
const nav = useNavStore();

const props = defineProps({
  id: { type: String, required: true },
});

const dataset = ref(null);
const loading = ref(true);
const error = ref(null);

const activeTab = ref("overview");
const counts = ref({
  files: null,
  grants: null,
  requests: null,
  collections: null,
  workflows: null,
  sourceDatasets: null,
  derivedDatasets: null,
});

const grantsTabRef = ref(null);
const requestTabRef = ref(null);

// `can` is the caller's authority and `enabled` adds what the dataset's state admits.
// @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
const { can, enabled, availableActions } = useCapabilities(dataset);

const callerRole = computed(() =>
  badgeFor(dataset.value?._meta?.standing, "dataset"),
);

const isUpload = computed(
  () =>
    dataset.value?.create_method === constants.DATASET_CREATE_METHODS.UPLOAD,
);

/**
 * Whether a control the state withholds is hidden rather than disabled.
 *
 * Two states reach a dataset and they want different treatment. An archived owning group is
 * reversible, so its controls stay visible and disabled: the caller still holds the authority
 * and will hold it again. Deletion is final — a dataset has no unarchive — so a control that
 * can never work again is not worth showing, and a disabled Download that will stay disabled
 * forever reads as a fault in the page.
 *
 * `is_deleted` chooses the presentation only. Whether an action is permitted is
 * `available_actions`, and this never re-derives it: a deleted dataset still shows every
 * control whose action the state admits, such as viewing metadata or the audit log.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */
const stateIsFinal = computed(() => dataset.value?.is_deleted === true);

/**
 * A control's authority, under the display rule: hidden once deletion has settled the
 * question, and otherwise left to `enabled` to disable.
 */
function shows(action) {
  return stateIsFinal.value ? enabled(action) : can(action);
}

/** The state's answer as the Overview tab takes it: a list, or null when unanswered. */
const availableActionList = computed(() =>
  availableActions.value ? [...availableActions.value] : null,
);

function setNavBreadcrumbs() {
  const items = [{ label: "Datasets", to: "/v2/datasets" }];
  items.push({ label: "..." });
  nav.setNavItems(items);
}

async function fetchDatasetData() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await DatasetService.get(props.id);
    dataset.value = data;
    setNavBreadcrumbs(data);
    // A caller who may list files receives num_files. A dataset never counted has none, and
    // reads as 0. Everyone else gets no count, so no badge and no card.
    counts.value.files = can("list_files") ? (data.num_files ?? 0) : null;
    await fetchCounts();
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function fetchCounts() {
  await Promise.allSettled([
    can("manage_grants") ? fetchGrantsCount() : Promise.resolve(),
    fetchRequestCount(),
    can("view_collections") ? fetchCollectionsCount() : Promise.resolve(),
    can("view_source_datasets")
      ? fetchSourceDatasetsCount()
      : Promise.resolve(),
    can("view_derived_datasets")
      ? fetchDerivedDatasetsCount()
      : Promise.resolve(),
    can("view_workflows") ? fetchWorkflowsCount() : Promise.resolve(),
  ]);
}

async function fetchWorkflowsCount() {
  try {
    const { data } = await DatasetService.listWorkflows(props.id);
    counts.value.workflows = (data || []).length;
  } catch {
    counts.value.workflows = null;
  }
}

async function fetchGrantsCount() {
  if (!can("manage_grants")) return;
  try {
    const { data } = await GrantService.countGrantsForDataset(props.id);
    counts.value.grants = data?.count ?? null;
  } catch {
    counts.value.grants = null;
  }
}

async function fetchRequestCount() {
  try {
    const req = can("review_access_requests")
      ? AccessRequestService.pendingReview({ resource_id: props.id, limit: 0 })
      : AccessRequestService.requestedByMe({ resource_id: props.id, limit: 0 });

    const { data } = await req;
    counts.value.requests = data.metadata?.total ?? null;
  } catch {
    counts.value.requests = null;
  }
}

async function fetchCollectionsCount() {
  if (!can("view_collections")) return;
  try {
    const { data } = await CollectionService.search({
      dataset_id: props.id,
      limit: 0,
    });
    counts.value.collections = data.metadata?.total ?? null;
  } catch {
    counts.value.collections = null;
  }
}

async function fetchSourceDatasetsCount() {
  if (!can("view_source_datasets")) return;
  try {
    const { data } = await DatasetService.getSourceDatasets(props.id, {
      limit: 0,
    });
    counts.value.sourceDatasets = data.metadata?.total ?? null;
  } catch {
    counts.value.sourceDatasets = null;
  }
}

async function fetchDerivedDatasetsCount() {
  if (!can("view_derived_datasets")) return;
  try {
    const { data } = await DatasetService.getDerivedDatasets(props.id, {
      limit: 0,
    });
    counts.value.derivedDatasets = data.metadata?.total ?? null;
  } catch {
    counts.value.derivedDatasets = null;
  }
}

onMounted(() => {
  fetchDatasetData();
});

const deleteModal = ref(null);

function openDeleteModal() {
  deleteModal.value?.show();
}

function handleActionRequested(payload) {
  // Switch to the requested tab
  activeTab.value = payload.tabName;

  // Open the modal after DOM has rendered the new tab
  nextTick(() => {
    if (payload.modalName === "issue-grants" && grantsTabRef.value) {
      grantsTabRef.value?.openIssueGrantModal?.();
    } else if (payload.modalName === "request-access" && requestTabRef.value) {
      requestTabRef.value?.openRequestAccessModal?.();
    }
  });
}
</script>

<route lang="yaml">
meta:
  title: Dataset Detail
</route>
