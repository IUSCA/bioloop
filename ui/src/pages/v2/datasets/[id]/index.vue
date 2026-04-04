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
      <div class="flex items-center justify-start flex-wrap gap-3 mt-3">
        <div class="flex items-center gap-3">
          <i-mdi-database
            class="text-2xl shrink-0"
            style="color: var(--va-primary)"
          />
          <div>
            <h1 class="text-xl font-semibold">{{ dataset.name }}</h1>
            <p class="text-sm va-text-secondary">{{ dataset.type }}</p>
          </div>
          <ModernChip v-if="dataset.is_deleted" color="accent" class="ml-2">
            Archived
          </ModernChip>
        </div>

        <div
          class="flex items-center gap-1 shrink-0 text-sm va-text-secondary ml-auto"
        >
          <span>Owned by</span>
          <RouterLink
            v-if="dataset.owner_group?.name"
            class="max-w-md truncate font-medium"
            :to="`/v2/groups/${dataset.owner_group.id}`"
          >
            {{ dataset.owner_group.name }}
          </RouterLink>
        </div>

        <div class="ml-auto">
          <ResourceRoleBadge
            v-if="callerRole"
            :role-name="callerRole"
            size="base"
          />
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
              Grants
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
          @update="fetchDatasetData"
          @toggle-archive="openArchiveModal"
        />

        <DatasetFilesTab
          v-else-if="activeTab === 'files'"
          :dataset="dataset"
          :can-download="can('download')"
        />

        <DatasetCollectionsTab
          v-else-if="activeTab === 'collections'"
          :dataset-id="dataset.resource_id"
        />

        <DatasetGrantsTab
          v-else-if="activeTab === 'grants'"
          :dataset-id="dataset.resource_id"
          :can-manage-grants="can('manage_grants')"
          @count-changed="fetchGrantsCount"
        />

        <DatasetRequestsTab
          v-else-if="activeTab === 'requests'"
          :dataset-id="dataset.resource_id"
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
        ref="archiveModal"
        :dataset-id="dataset.resource_id"
        :dataset-name="dataset.name"
        :dataset-type="dataset.type"
        @update="fetchDatasetData"
      />
    </div>
  </Transition>
</template>

<script setup>
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
});

const capabilities = computed(
  () => new Set(dataset.value?._meta?.capabilities ?? []),
);
const callerRole = computed(() => dataset.value?._meta?.caller_role);

function can(action) {
  return capabilities.value.has(action);
}

function setNavBreadcrumbs(d) {
  const items = [{ label: "Datasets", to: "/v2/datasets" }];
  items.push({ label: d.name });
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
  ]);
}

async function fetchGrantsCount() {
  if (!can("manage_grants")) return;
  try {
    const { data } = await GrantService.countGrantsForResource(
      "DATASET",
      props.id,
    );
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

onMounted(() => {
  fetchDatasetData();
});

const archiveModal = ref(null);

function openArchiveModal() {
  archiveModal.value?.show();
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
