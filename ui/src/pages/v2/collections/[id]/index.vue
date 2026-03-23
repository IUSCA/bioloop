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
        :title="'Failed to load collection'"
        :message="error?.message"
        @retry="fetchCollectionData"
      />
    </div>

    <!-- Loaded -->
    <div v-else-if="collection">
      <!-- Page header -->
      <div class="flex items-center justify-start flex-wrap gap-3 mt-3">
        <div class="flex items-center gap-3">
          <i-mdi-folder-multiple
            class="text-2xl shrink-0"
            style="color: var(--va-primary)"
          />
          <div>
            <h1 class="text-xl font-semibold">{{ collection.name }}</h1>
          </div>
          <div>
            <ModernChip
              v-if="collection.is_archived"
              color="accent"
              class="ml-2"
            >
              Archived
            </ModernChip>
          </div>
        </div>

        <!-- archived badge -->
        <div>
          <ModernChip v-if="collection.is_archived" color="accent" class="ml-2">
            Archived
          </ModernChip>
        </div>

        <!-- owner group badge -->
        <div class="flex items-center gap-1 shrink-0 text-sm va-text-secondary">
          <span> Owned by </span>
          <RouterLink
            v-if="collection.owner_group?.name"
            class="max-w-md truncate"
            :to="`/v2/groups/${collection.owner_group.id}`"
          >
            {{ collection.owner_group.name }}
          </RouterLink>
        </div>

        <!-- resource role badge -->
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
          <VaTab name="datasets" v-if="can('list_datasets')">
            <span class="flex items-center gap-1.5">
              Datasets
              <span v-if="counts.datasets !== null" class="tab-count-badge">
                {{ counts.datasets }}
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
          <VaTab name="grants" v-if="can('list_grants')">
            <span class="flex items-center gap-1.5">
              Grants
              <span v-if="counts.grants !== null" class="tab-count-badge">
                {{ counts.grants }}
              </span>
            </span>
          </VaTab>
          <VaTab name="audit-log" v-if="can('list_grants')">Audit Log</VaTab>
        </template>
      </VaTabs>

      <!-- Tab panels -->
      <div>
        <CollectionOverviewTab
          v-if="activeTab === 'overview'"
          :collection="collection"
          :counts="counts"
          :can-edit="can('edit_metadata')"
          :can-review="can('review_requests')"
          :can-archive="canArchive"
          :can-unarchive="canUnarchive"
          @update="fetchCollectionData"
          @toggle-archive="openArchiveModal"
        />

        <CollectionDatasetsTab
          v-else-if="activeTab === 'datasets'"
          :collection="collection"
          :can-create="can('add_dataset')"
          :can-remove="can('remove_dataset')"
          @count-changed="fetchDatasetCount"
        />

        <CollectionGrantsTab
          v-else-if="activeTab === 'grants'"
          :collection-id="props.id"
          :can-manage="can('manage_grants')"
          @count-changed="fetchGrantsCount"
        />

        <CollectionRequestsTab
          v-else-if="activeTab === 'requests'"
          :collection-id="props.id"
          :can-review="can('review_requests')"
          @count-changed="fetchRequestCount"
        />

        <CollectionAuditLogTab
          v-else-if="activeTab === 'audit-log'"
          :collection-id="props.id"
        />
      </div>

      <!-- Archive confirm modal -->
      <CollectionArchiveConfirmModal
        ref="archiveModal"
        :collection-id="props.id"
        :collection-name="collection.name"
        :collection-slug="collection.slug"
        :is-archived="collection.is_archived"
        :affected-datasets="counts.datasets"
        @update="fetchCollectionData"
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

const props = defineProps({ id: { type: String, required: true } });

const nav = useNavStore();

const collection = ref(null);
const loading = ref(true);
const error = ref(null);

const activeTab = ref("overview");
const counts = ref({ datasets: null, grants: null, requests: null });

const capabilities = computed(
  () => new Set(collection.value?._meta?.capabilities ?? []),
);
const callerRole = computed(() => collection.value?._meta?.caller_role);

function can(action) {
  return capabilities.value.has(action);
}

const canArchive = computed(
  () => can("archive") && collection.value?.is_archived === false,
);

const canUnarchive = computed(
  () => can("unarchive") && collection.value?.is_archived === true,
);

function setNavBreadcrumbs(c) {
  const items = [{ label: "Collections", to: "/v2/collections" }];
  items.push({ label: "...", to: `/v2/collections/${c.id}` });
  nav.setNavItems(items);
}

async function fetchCollectionData() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await CollectionService.get(props.id);
    collection.value = data;
    setNavBreadcrumbs(data);

    await fetchCounts();
    // await Promise.allSettled([fetchDatasetCount(), fetchGrantsCount()]);
  } catch (err) {
    error.value = err?.response?.data?.message ?? "Failed to load collection.";
  } finally {
    loading.value = false;
  }
}

async function fetchCounts() {
  await Promise.allSettled([
    fetchDatasetCount(),
    fetchGrantsCount(),
    fetchRequestCount(),
  ]);
}

async function fetchDatasetCount() {
  if (!can("list_datasets")) {
    return;
  }

  try {
    const { data } = await DatasetService.search({
      collection_id: props.id,
      limit: 0,
    });
    counts.value.datasets = data.metadata?.total ?? null;
  } catch {
    counts.value.datasets = null;
  }
}

async function fetchGrantsCount() {
  if (!can("list_grants")) {
    return;
  }

  try {
    const { data } = await GrantService.listGrantsForCollection(props.id, {
      active: true,
      limit: 0,
    });
    counts.value.grants = data.metadata?.total ?? null;
  } catch {
    counts.value.grants = null;
  }
}

async function fetchRequestCount() {
  // if user can review requests, show count of pending review requests,
  // otherwise show count of requests they have made

  if (can("review_requests")) {
    try {
      const { data } = await AccessRequestService.pendingReview({
        resource_id: props.id,
        limit: 0,
      });
      counts.value.requests = data.metadata?.total ?? null;
    } catch {
      counts.value.requests = null;
    }
  } else {
    try {
      const { data } = await AccessRequestService.requestedByMe({
        resource_id: props.id,
        limit: 0,
      });
      counts.value.requests = data.metadata?.total ?? null;
    } catch {
      counts.value.requests = null;
    }
  }
}

onMounted(() => fetchCollectionData());

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
  title: Collection Detail
</route>
