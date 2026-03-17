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
      <div class="flex items-center justify-between flex-wrap gap-3 mt-3">
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

        <div class="flex items-center gap-2 shrink-0">
          <ModernChip
            v-if="collection.owner_group?.name"
            class="px-3 py-1 max-w-md truncate"
            no-color
          >
            {{ collection.owner_group.name }}
          </ModernChip>
        </div>
      </div>

      <!-- Tabs -->
      <VaTabs
        v-model="activeTab"
        class="border-b border-solid border-blue-500/50"
      >
        <template #tabs>
          <VaTab name="overview">Overview</VaTab>
          <VaTab name="datasets">
            <span class="flex items-center gap-1.5">
              Datasets
              <span v-if="counts.datasets !== null" class="tab-count-badge">
                {{ counts.datasets }}
              </span>
            </span>
          </VaTab>
          <VaTab name="access">
            <span class="flex items-center gap-1.5">
              Access
              <span v-if="counts.access !== null" class="tab-count-badge">
                {{ counts.access }}
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
          <VaTab name="audit-log">Audit Log</VaTab>
        </template>
      </VaTabs>

      <!-- Tab panels -->
      <div>
        <CollectionOverviewTab
          v-if="activeTab === 'overview'"
          :collection="collection"
          :counts="counts"
          :can-edit="canEdit"
          :can-archive="canArchive"
          :can-unarchive="canUnarchive"
          @update="fetchCollectionData"
          @toggle-archive="openArchiveModal"
        />

        <CollectionDatasetsTab
          v-else-if="activeTab === 'datasets'"
          :collection-id="props.id"
          :can-create="can('add_dataset')"
          :can-remove="can('remove_dataset')"
          @count-changed="handleDatasetsUpdate"
        />

        <CollectionAccessTab
          v-else-if="activeTab === 'access'"
          :collection-id="props.id"
        />

        <CollectionRequestsTab
          v-else-if="activeTab === 'requests'"
          :collection-id="props.id"
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
const counts = ref({ datasets: null, access: null, requests: null });

const capabilities = computed(
  () => new Set(collection.value?._meta?.capabilities ?? []),
);

function can(action) {
  return capabilities.value.has(action);
}

const canEdit = computed(() => can("edit_metadata"));

const canArchive = computed(
  () => can("archive") && collection.value?.is_archived === false,
);

const canUnarchive = computed(
  () => can("unarchive") && collection.value?.is_archived === true,
);

function setNavBreadcrumbs(c) {
  const items = [{ label: "Collections", to: "/v2/collections" }];
  items.push({ label: c.name, to: `/v2/collections/${c.id}` });
  nav.setNavItems(items);
}

async function fetchCollectionData() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await CollectionService.get(props.id);
    collection.value = data;
    setNavBreadcrumbs(data);

    await Promise.allSettled([fetchDatasetCount(), fetchAccessCount()]);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function fetchDatasetCount() {
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

async function fetchAccessCount() {
  try {
    const { data } = await GrantService.listGrantsForCollection(props.id, {
      active: true,
      limit: 0,
    });
    counts.value.access = data.metadata?.total ?? null;
  } catch {
    counts.value.access = null;
  }
}

function handleDatasetsUpdate() {
  fetchDatasetCount();
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
