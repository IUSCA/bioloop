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
        :message="error?.message"
        @retry="fetchDatasetData"
      />
    </div>

    <!-- Loaded -->
    <div v-else-if="dataset">
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
            <!-- <ModernChip v-if="dataset.is_deleted" color="accent" class="ml-2">
            Deleted
          </ModernChip> -->
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
            <ResourceRoleBadge :role-name="callerRole" size="base" />
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
          <VaTab name="grants" v-if="can('manage_grants')">
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
          :can-edit="can('edit_metadata')"
          :can-archive="can('archive')"
          :can-issue-grants="can('manage_grants')"
          :can-download="can('download')"
          @update="fetchDatasetData"
          @delete="openDeleteModal"
          @action-requested="handleActionRequested"
          @navigate-to-files="activeTab = 'files'"
        />

        <DatasetFilesTab
          v-else-if="activeTab === 'files'"
          :dataset="dataset"
          :can-download="can('download')"
          :has-files="hasFiles"
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
          v-else-if="activeTab === 'grants'"
          :dataset="dataset"
          :can-manage-grants="can('manage_grants')"
          @count-changed="fetchGrantsCount"
        />

        <DatasetRequestsTab
          ref="requestTabRef"
          v-else-if="activeTab === 'requests'"
          :dataset="dataset"
          :can-review="can('review_access_requests')"
          @count-changed="fetchRequestCount"
        />

        <DatasetWorkflowsTab
          v-else-if="activeTab === 'workflows'"
          :workflows="dataset.workflows || []"
          :loading="false"
        />

        <DatasetAuditLogTab
          v-else-if="activeTab === 'audit-log'"
          :dataset-id="dataset.resource_id"
        />
      </div>

      <!-- Archive confirm modal -->
      <DatasetArchiveConfirmModal
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
import constants from "@/constants";
import AccessRequestService from "@/services/v2/access-requests";
import CollectionService from "@/services/v2/collections";
import DatasetService from "@/services/v2/datasets";
import GrantService from "@/services/v2/grants";
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

const capabilities = computed(
  () => new Set(dataset.value?._meta?.capabilities ?? []),
);
const callerRole = computed(() => dataset.value?._meta?.caller_role);

const hasFiles = computed(() => (counts.value?.files || 0) > 0);

function can(action) {
  return capabilities.value.has(action);
}

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
    counts.value.files = data.num_files;
    counts.value.workflows = (data.workflows || []).length;
    await fetchCounts();
  } catch (err) {
    error.value = err?.response?.data?.message ?? "Failed to load dataset.";
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
  ]);
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

<style scoped>
.tab-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  font-size: 13px;
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
  title: Dataset Detail
</route>
