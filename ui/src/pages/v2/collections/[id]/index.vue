<route lang="yaml">
meta:
  title: Collection Detail
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- Loading -->
    <template v-if="collectionsStore.selectedCollectionLoading">
      <VaSkeleton variant="text" height="32px" width="260px" />
      <VaSkeleton variant="rounded" height="48px" />
      <VaSkeleton variant="rounded" height="320px" />
    </template>

    <!-- Error -->
    <VaAlert
      v-else-if="collectionsStore.selectedCollectionError"
      color="danger"
      icon="mdi-alert-circle-outline"
    >
      Failed to load collection.
      {{ collectionsStore.selectedCollectionError?.response?.data?.message ?? collectionsStore.selectedCollectionError?.message }}
    </VaAlert>

    <!-- Loaded -->
    <template v-else-if="collection">
      <!-- Page header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <i-mdi-folder-multiple class="text-3xl shrink-0" style="color: var(--va-primary)" />
          <div>
            <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {{ collection.name }}
            </h1>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <VaChip v-if="collection.is_archived" color="secondary" size="small">Archived</VaChip>
              <span
                v-if="collection.owner_group?.name"
                class="text-xs"
                style="color: var(--va-secondary)"
              >
                <i-mdi-account-group-outline class="text-sm mr-0.5" />
                {{ collection.owner_group.name }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tabs ────────────────────────────────────────────────────── -->
      <VaTabs v-model="activeTab">
        <template #tabs>
          <VaTab name="overview">Overview</VaTab>
          <VaTab name="datasets">Datasets</VaTab>
          <VaTab name="access">Access</VaTab>
          <VaTab v-if="canEdit" name="settings">Settings</VaTab>
        </template>
      </VaTabs>

      <div class="mt-2">
        <!-- ── Overview ─────────────────────────────────────────────── -->
        <template v-if="activeTab === 'overview'">
          <VaCard>
            <VaCardContent>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Name</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">{{ collection.name }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Status</dt>
                  <dd class="mt-1"><VaChip :color="collection.is_archived ? 'secondary' : 'success'" size="small">{{ collection.is_archived ? 'Archived' : 'Active' }}</VaChip></dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Owner Group</dt>
                  <dd class="mt-1 text-sm">
                    <RouterLink
                      v-if="collection.owner_group"
                      :to="`/v2/groups/${collection.owner_group.id}`"
                      class="hover:underline"
                      style="color: var(--va-primary)"
                    >
                      {{ collection.owner_group.name }}
                    </RouterLink>
                    <span v-else class="text-gray-500">—</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Collection ID</dt>
                  <dd class="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 select-all">{{ collection.id }}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Description</dt>
                  <dd class="mt-1 text-sm text-gray-700 dark:text-gray-300">{{ collection.description || '—' }}</dd>
                </div>
              </dl>
            </VaCardContent>
          </VaCard>
        </template>

        <!-- ── Datasets ─────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'datasets'">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Datasets</h2>
            <VaButton
              v-if="canEdit"
              preset="primary"
              size="small"
              icon="add"
              @click="showAddDatasetModal = true"
            >
              Add Dataset
            </VaButton>
          </div>

          <VaSkeleton v-if="collectionsStore.collectionDatasetsLoading" variant="rounded" height="160px" />
          <template v-else>
            <div
              v-if="collectionsStore.collectionDatasets.length === 0"
              class="flex flex-col items-center py-8 gap-2 text-center"
            >
              <i-mdi-database-off-outline class="text-4xl text-gray-300 dark:text-gray-600" />
              <p class="text-sm" style="color: var(--va-secondary)">No datasets in this collection.</p>
            </div>

            <VaDataTable
              v-else
              :items="collectionsStore.collectionDatasets"
              :columns="datasetColumns"
              hoverable
              striped
            >
              <template #cell(name)="{ row }">
                <RouterLink
                  :to="`/v2/datasets/${row.rowData.id}`"
                  class="text-sm hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ row.rowData.name }}
                </RouterLink>
              </template>
              <template #cell(type)="{ row }">
                <VaChip color="info" size="small">{{ row.rowData.type ?? '—' }}</VaChip>
              </template>
              <template #cell(actions)="{ row }">
                <VaButton
                  v-if="canEdit"
                  preset="plain"
                  color="danger"
                  size="small"
                  icon="remove_circle_outline"
                  :loading="removingDatasetId === row.rowData.id"
                  title="Remove from collection"
                  @click="handleRemoveDataset(row.rowData)"
                />
              </template>
            </VaDataTable>
          </template>

          <DatasetAddModal
            v-model="showAddDatasetModal"
            :existing-dataset-ids="existingDatasetIds"
            :loading="addingDataset"
            @add="handleAddDataset"
          />
        </template>

        <!-- ── Access ───────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'access'">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Active Grants</h2>
            <VaButton
              v-if="canEdit"
              preset="primary"
              size="small"
              icon="add"
              @click="showGrantModal = true"
            >
              Grant Access
            </VaButton>
          </div>

          <GrantExplorer
            ref="grantExplorerRef"
            :fixed-filters="{ resource_type: 'COLLECTION', resource_id: props.id }"
            :can-revoke="canEdit"
            :show-filters="false"
            @revoked="onGrantRevoked"
          />

          <GrantAccessModal
            v-model="showGrantModal"
            :loading="grantingAccess"
            @grant="handleGrant"
          />
        </template>

        <!-- ── Settings ─────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'settings' && canEdit">
          <div class="flex flex-col gap-6">
            <!-- Edit Metadata -->
            <VaCard>
              <VaCardTitle>Edit Collection Metadata</VaCardTitle>
              <VaCardContent>
                <form class="flex flex-col gap-4" @submit.prevent="handleSaveMetadata">
                  <VaInput v-model="editForm.name" label="Name" required />
                  <VaTextarea v-model="editForm.description" label="Description" rows="3" />
                  <div class="flex justify-end">
                    <VaButton type="submit" preset="primary" :loading="savingMetadata" :disabled="!editForm.name.trim()">
                      Save Changes
                    </VaButton>
                  </div>
                </form>
              </VaCardContent>
            </VaCard>

            <!-- Danger Zone -->
            <VaCard class="border border-solid border-red-200 dark:border-red-800">
              <VaCardTitle>
                <span class="text-red-600 dark:text-red-400">Danger Zone</span>
              </VaCardTitle>
              <VaCardContent>
                <div class="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {{ collection.is_archived ? 'Unarchive this collection' : 'Archive this collection' }}
                    </p>
                    <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                      {{ collection.is_archived ? 'Restore collection. Platform admin only.' : 'Soft-delete this collection.' }}
                    </p>
                  </div>
                  <VaButton
                    v-if="!collection.is_archived"
                    preset="plain"
                    color="danger"
                    icon="archive"
                    @click="handleArchive"
                  >
                    Archive
                  </VaButton>
                  <VaButton
                    v-else-if="auth.canAdmin"
                    preset="plain"
                    color="success"
                    icon="unarchive"
                    @click="handleUnarchive"
                  >
                    Unarchive
                  </VaButton>
                </div>
              </VaCardContent>
            </VaCard>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import GrantExplorer from '@/components/v2/access/GrantExplorer.vue'
import DatasetAddModal from '@/components/v2/collections/DatasetAddModal.vue'
import GrantAccessModal from '@/components/v2/collections/GrantAccessModal.vue'
import CollectionService from '@/services/v2/collections'
import GrantService from '@/services/v2/grants'
import { useAuthStore } from '@/stores/auth'
import { useCollectionsStore } from '@/stores/v2/collections'
import { useToast } from 'vuestic-ui'

const props = defineProps({ id: { type: String, required: true } })

const auth = useAuthStore()
const collectionsStore = useCollectionsStore()
const { init: toast } = useToast()

const collection = computed(() => collectionsStore.selectedCollection)
const activeTab = ref('overview')

// ── Authority ─────────────────────────────────────────────────────────────
const canEdit = computed(() => auth.canOperate || collection.value?.caller_role === 'ADMIN')

// ── Datasets tab ──────────────────────────────────────────────────────────
const datasetColumns = computed(() => {
  const cols = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'type', label: 'Type' },
  ]
  if (canEdit.value) cols.push({ key: 'actions', label: '' })
  return cols
})

const showAddDatasetModal = ref(false)
const addingDataset = ref(false)
const removingDatasetId = ref(null)

const existingDatasetIds = computed(() =>
  collectionsStore.collectionDatasets.map((d) => d.id),
)

async function handleAddDataset(dataset) {
  addingDataset.value = true
  try {
    await CollectionService.addDatasets(props.id, [dataset.id])
    toast({ message: `"${dataset.name}" added to collection.`, color: 'success', position: 'bottom-right' })
    showAddDatasetModal.value = false
    collectionsStore.fetchCollectionDatasets(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to add dataset.', color: 'danger', position: 'bottom-right' })
  } finally {
    addingDataset.value = false
  }
}

async function handleRemoveDataset(dataset) {
  removingDatasetId.value = dataset.id
  try {
    await CollectionService.removeDataset(props.id, dataset.id)
    toast({ message: `"${dataset.name}" removed from collection.`, color: 'success', position: 'bottom-right' })
    collectionsStore.fetchCollectionDatasets(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to remove dataset.', color: 'danger', position: 'bottom-right' })
  } finally {
    removingDatasetId.value = null
  }
}

// ── Access tab ────────────────────────────────────────────────────────────
const showGrantModal = ref(false)
const grantingAccess = ref(false)
const grantExplorerRef = ref(null)

async function handleGrant(grantData) {
  grantingAccess.value = true
  try {
    await GrantService.create({
      ...grantData,
      resource_type: 'COLLECTION',
      resource_id: props.id,
    })
    toast({ message: 'Access granted.', color: 'success', position: 'bottom-right' })
    showGrantModal.value = false
    grantExplorerRef.value?.refresh()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to grant access.', color: 'danger', position: 'bottom-right' })
  } finally {
    grantingAccess.value = false
  }
}

function onGrantRevoked() {
  grantExplorerRef.value?.refresh()
}

// ── Settings tab ──────────────────────────────────────────────────────────
const editForm = reactive({ name: '', description: '' })
const savingMetadata = ref(false)

function syncEditForm() {
  if (collection.value) {
    editForm.name = collection.value.name ?? ''
    editForm.description = collection.value.description ?? ''
  }
}

async function handleSaveMetadata() {
  savingMetadata.value = true
  try {
    await CollectionService.update(props.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      version: collection.value.version,
    })
    toast({ message: 'Collection updated.', color: 'success', position: 'bottom-right' })
    collectionsStore.fetchCollection(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to update.', color: 'danger', position: 'bottom-right' })
  } finally {
    savingMetadata.value = false
  }
}

async function handleArchive() {
  try {
    await CollectionService.archive(props.id)
    toast({ message: 'Collection archived.', color: 'success', position: 'bottom-right' })
    collectionsStore.fetchCollection(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to archive.', color: 'danger', position: 'bottom-right' })
  }
}

async function handleUnarchive() {
  try {
    await CollectionService.unarchive(props.id)
    toast({ message: 'Collection unarchived.', color: 'success', position: 'bottom-right' })
    collectionsStore.fetchCollection(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to unarchive.', color: 'danger', position: 'bottom-right' })
  }
}

// ── Tab lazy-load ─────────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'datasets') collectionsStore.fetchCollectionDatasets(props.id)
  if (tab === 'settings') syncEditForm()
})

watch(collection, () => {
  if (activeTab.value === 'settings') syncEditForm()
})

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  collectionsStore.clearSelectedCollection()
  await collectionsStore.fetchCollection(props.id)
})

onUnmounted(() => collectionsStore.clearSelectedCollection())
</script>
