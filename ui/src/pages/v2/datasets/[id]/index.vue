<route lang="yaml">
meta:
  title: Dataset
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- Loading -->
    <template v-if="loading">
      <VaSkeleton variant="text" height="32px" width="260px" />
      <VaSkeleton variant="rounded" height="48px" />
      <VaSkeleton variant="rounded" height="320px" />
    </template>

    <!-- Error -->
    <VaAlert v-else-if="error" color="danger" icon="mdi-alert-circle-outline">
      Failed to load dataset. {{ error?.response?.data?.message ?? error?.message }}
    </VaAlert>

    <!-- Loaded -->
    <template v-else-if="dataset">
      <!-- Page header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <i-mdi-database class="text-3xl shrink-0" style="color: var(--va-primary)" />
          <div>
            <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">{{ dataset.name }}</h1>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <VaChip v-if="dataset.type" color="info" size="small">{{ dataset.type }}</VaChip>
              <VaChip v-if="dataset.is_deleted" color="secondary" size="small">Archived</VaChip>
              <!-- Owner group with authority badge -->
              <span v-if="dataset.owner_group?.name" class="flex items-center gap-1 text-xs" style="color: var(--va-secondary)">
                <i-mdi-account-group-outline class="text-sm" />
                <RouterLink
                  :to="`/v2/groups/${dataset.owner_group.id}`"
                  class="hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ dataset.owner_group.name }}
                </RouterLink>
                <VaChip v-if="ownerGroupAuthorityLabel" :color="ownerGroupAuthorityColor" size="small" class="ml-1">
                  {{ ownerGroupAuthorityLabel }}
                </VaChip>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tabs ──────────────────────────────────────────────────────── -->
      <VaTabs v-model="activeTab">
        <template #tabs>
          <VaTab name="overview">Overview</VaTab>
          <VaTab name="access">Access</VaTab>
          <VaTab name="collections">Collections</VaTab>
          <VaTab v-if="canEdit" name="settings">Settings</VaTab>
        </template>
      </VaTabs>

      <div class="mt-2">
        <!-- ── Overview ───────────────────────────────────────────────── -->
        <template v-if="activeTab === 'overview'">
          <div class="flex flex-col gap-4">
            <VaCard>
              <VaCardContent>
                <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Name</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">{{ dataset.name }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Type</dt>
                    <dd class="mt-1"><VaChip color="info" size="small">{{ dataset.type ?? '—' }}</VaChip></dd>
                  </div>
                  <div>
                    <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Status</dt>
                    <dd class="mt-1"><VaChip :color="dataset.is_deleted ? 'secondary' : 'success'" size="small">{{ dataset.is_deleted ? 'Archived' : 'Active' }}</VaChip></dd>
                  </div>
                  <div v-if="dataset.created_at">
                    <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Created</dt>
                    <dd class="mt-1 text-sm text-gray-700 dark:text-gray-300">{{ new Date(dataset.created_at).toLocaleDateString() }}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Dataset ID</dt>
                    <dd class="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 select-all">{{ dataset.id }}</dd>
                  </div>
                </dl>
              </VaCardContent>
            </VaCard>

            <!-- Why do I have access? -->
            <VaCard>
              <VaCardContent>
                <AccessExplanation resource-type="DATASET" :resource-id="props.id" />
              </VaCardContent>
            </VaCard>
          </div>
        </template>

        <!-- ── Access tab ─────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'access'">
          <div class="flex flex-col gap-4">
            <!-- Admin: grant explorer + grant button -->
            <div v-if="canEdit">
              <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Active Grants</h2>
                <VaButton
                  preset="primary"
                  size="small"
                  icon="mdi-key-plus"
                  @click="showGrantModal = true"
                >
                  <div class="flex items-center">
                    <i-mdi-key-plus class="text-lg mr-1" />
                    <span> Grant Access </span>
                </div>
                </VaButton>
              </div>
              <GrantExplorer
                ref="grantExplorerRef"
                :fixed-filters="{ resource_type: 'DATASET', resource_id: props.id }"
                :can-revoke="true"
                :show-filters="false"
              />
              <GrantAccessModal
                v-model="showGrantModal"
                :loading="grantingAccess"
                @grant="handleGrant"
              />
            </div>

            <!-- Non-admin: request access + access explanation -->
            <template v-else>
              <AccessExplanation resource-type="DATASET" :resource-id="props.id" />

              <div class="flex justify-center mt-2">
                <VaButton
                  preset="primary"
                  @click="showAccessRequestModal = true"
                >
                <div class="flex items-center">
                  <i-mdi-key-plus class="text-lg mr-1" />
                  <span> Request Access </span>
                </div>
                  
                </VaButton>
              </div>
            </template>
          </div>

          <!-- Simple access request modal for non-admins -->
          <VaModal
            v-model="showAccessRequestModal"
            title="Request Access"
            ok-text="Submit Request"
            :ok-disabled="!accessRequestPurpose.trim()"
            :loading="submittingRequest"
            @ok="handleSubmitAccessRequest"
          >
            <VaTextarea
              v-model="accessRequestPurpose"
              label="Purpose / Justification"
              placeholder="Describe why you need access to this dataset…"
              rows="4"
              required
            />
          </VaModal>
        </template>

        <!-- ── Collections tab ────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'collections'">
          <VaSkeleton v-if="collectionsLoading" variant="rounded" height="160px" />
          <template v-else>
            <div
              v-if="memberCollections.length === 0"
              class="flex flex-col items-center py-8 gap-2 text-center"
            >
              <i-mdi-folder-multiple-outline class="text-4xl text-gray-300 dark:text-gray-600" />
              <p class="text-sm" style="color: var(--va-secondary)">
                This dataset is not part of any collection.
              </p>
            </div>
            <VaDataTable
              v-else
              :items="memberCollections"
              :columns="[{ key: 'name', label: 'Collection', sortable: true }, { key: 'owner_group', label: 'Owner Group' }]"
              hoverable
              striped
            >
              <template #cell(name)="{ row }">
                <RouterLink
                  :to="`/v2/collections/${row.rowData.id}`"
                  class="text-sm hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ row.rowData.name }}
                </RouterLink>
              </template>
              <template #cell(owner_group)="{ row }">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  {{ row.rowData.owner_group?.name ?? '—' }}
                </span>
              </template>
            </VaDataTable>
          </template>
        </template>

        <!-- ── Settings ───────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'settings' && canEdit">
          <VaCard class="border border-solid border-red-200 dark:border-red-800">
            <VaCardTitle>
              <span class="text-red-600 dark:text-red-400">Danger Zone</span>
            </VaCardTitle>
            <VaCardContent>
              <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Archive this dataset
                  </p>
                  <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                    Marks the dataset as deleted. Platform admin can reverse this.
                  </p>
                </div>
                <VaButton
                  preset="plain"
                  color="danger"
                  icon="archive"
                  :loading="archivingDataset"
                  @click="handleArchiveDataset"
                >
                  Archive Dataset
                </VaButton>
              </div>
            </VaCardContent>
          </VaCard>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import AccessExplanation from '@/components/v2/access/AccessExplanation.vue'
import GrantExplorer from '@/components/v2/access/GrantExplorer.vue'
import GrantAccessModal from '@/components/v2/collections/GrantAccessModal.vue'
import AccessRequestService from '@/services/v2/access-requests'
import CollectionService from '@/services/v2/collections'
import DatasetService from '@/services/v2/datasets'
import GrantService from '@/services/v2/grants'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vuestic-ui'

const props = defineProps({ id: { type: String, required: true } })

const auth = useAuthStore()
const { init: toast } = useToast()

const dataset = ref(null)
const loading = ref(false)
const error = ref(null)
const activeTab = ref('overview')

// ── Authority ─────────────────────────────────────────────────────────────
const canEdit = computed(
  () => auth.canOperate || dataset.value?.caller_role === 'ADMIN',
)

const AUTHORITY_COLORS = { Admin: 'primary', 'Platform Admin': 'danger', Oversight: 'warning', Member: 'secondary' }
const ownerGroupAuthorityLabel = computed(() => {
  if (auth.canAdmin) return 'Platform Admin'
  const role = dataset.value?.caller_role
  if (role === 'ADMIN') return 'Admin'
  if (role === 'OVERSIGHT') return 'Oversight'
  return null
})
const ownerGroupAuthorityColor = computed(() => AUTHORITY_COLORS[ownerGroupAuthorityLabel.value] ?? 'secondary')

// ── Data fetch ────────────────────────────────────────────────────────────
async function fetchDataset() {
  loading.value = true
  error.value = null
  try {
    const { data } = await DatasetService.get(props.id)
    dataset.value = data
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
}

// ── Collections tab ───────────────────────────────────────────────────────
const memberCollections = ref([])
const collectionsLoading = ref(false)

async function fetchMemberCollections() {
  collectionsLoading.value = true
  try {
    const { data: { data: allCollections } } = await CollectionService.search({ limit: 100 })
    // Filter to those containing this dataset — best effort client-side filter
    // (no dedicated API endpoint yet)
    memberCollections.value = allCollections.filter((c) =>
      c.dataset_ids?.includes(Number(props.id)) || c.dataset_ids?.includes(props.id),
    )
  } catch {
    memberCollections.value = []
  } finally {
    collectionsLoading.value = false
  }
}

// ── Access tab ────────────────────────────────────────────────────────────
const showGrantModal = ref(false)
const grantingAccess = ref(false)
const grantExplorerRef = ref(null)

async function handleGrant(grantData) {
  grantingAccess.value = true
  try {
    await GrantService.create({ ...grantData, resource_type: 'DATASET', resource_id: props.id })
    toast({ message: 'Access granted.', color: 'success', position: 'bottom-right' })
    showGrantModal.value = false
    grantExplorerRef.value?.refresh()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to grant access.', color: 'danger', position: 'bottom-right' })
  } finally {
    grantingAccess.value = false
  }
}

const showAccessRequestModal = ref(false)
const accessRequestPurpose = ref('')
const submittingRequest = ref(false)

async function handleSubmitAccessRequest() {
  submittingRequest.value = true
  try {
    const req = await AccessRequestService.create({
      resource_type: 'DATASET',
      resource_id: props.id,
      purpose: accessRequestPurpose.value.trim(),
      items: [],
    })
    await AccessRequestService.submit(req.data?.id ?? req.id)
    toast({ message: 'Access request submitted.', color: 'success', position: 'bottom-right' })
    showAccessRequestModal.value = false
    accessRequestPurpose.value = ''
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to submit request.', color: 'danger', position: 'bottom-right' })
  } finally {
    submittingRequest.value = false
  }
}

// ── Settings tab ──────────────────────────────────────────────────────────
const archivingDataset = ref(false)

async function handleArchiveDataset() {
  archivingDataset.value = true
  try {
    await DatasetService.archive(props.id)
    toast({ message: 'Dataset archived.', color: 'success', position: 'bottom-right' })
    fetchDataset()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to archive dataset.', color: 'danger', position: 'bottom-right' })
  } finally {
    archivingDataset.value = false
  }
}

// ── Tab lazy-load ─────────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'collections') fetchMemberCollections()
})

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(fetchDataset)
</script>
