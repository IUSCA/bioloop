<route lang="yaml">
meta:
  title: Group Detail
</route>

<template>
  <div class="flex flex-col gap-6 pb-6">
    <!-- ── Loading ───────────────────────────────────────────────────── -->
    <template v-if="groupsStore.selectedGroupLoading">
      <VaSkeleton variant="text" height="32px" width="260px" />
      <VaSkeleton variant="rounded" height="48px" />
      <VaSkeleton variant="rounded" height="320px" />
    </template>

    <!-- ── Error ─────────────────────────────────────────────────────── -->
    <VaAlert
      v-else-if="groupsStore.selectedGroupError"
      color="danger"
      icon="mdi-alert-circle-outline"
    >
      Failed to load group.
      {{ groupsStore.selectedGroupError?.response?.data?.message ?? groupsStore.selectedGroupError?.message }}
    </VaAlert>

    <!-- ── Loaded ─────────────────────────────────────────────────────── -->
    <template v-else-if="group">
      <!-- Page header -->
      <div>
        <!-- Breadcrumb -->
        <GroupBreadcrumb
          v-if="groupsStore.ancestors.length > 0"
          :ancestors="groupsStore.ancestors"
          :current-name="group.name"
          class="mb-2"
        />

        <div class="flex items-start justify-between flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <i-mdi-account-group class="text-3xl shrink-0" style="color: var(--va-primary)" />
            <div>
              <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {{ group.name }}
              </h1>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <VaChip v-if="group.is_archived" color="secondary" size="small">
                  Archived
                </VaChip>
                <VaChip :color="authorityColor" size="small">
                  {{ authorityLabel }}
                </VaChip>
              </div>
            </div>
          </div>
        </div>

        <!-- Oversight Banner -->
        <div v-if="isOversightOnly" class="mt-4">
          <AuthorityBanner />
        </div>
      </div>

      <!-- ── Tabs ────────────────────────────────────────────────────── -->
      <VaTabs v-model="activeTab" class="mt-2">
        <template #tabs>
          <VaTab name="overview">Overview</VaTab>
          <VaTab name="members">Members</VaTab>
          <VaTab name="admins">Admins</VaTab>
          <VaTab name="datasets">Owned Datasets</VaTab>
          <VaTab name="collections">Owned Collections</VaTab>
          <VaTab name="activity">Activity Log</VaTab>
          <VaTab v-if="canEdit" name="settings">Settings</VaTab>
        </template>
      </VaTabs>

      <div class="mt-2">
        <!-- ── Overview Tab ──────────────────────────────────────────── -->
        <template v-if="activeTab === 'overview'">
          <VaCard>
            <VaCardContent>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Name</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">{{ group.name }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Status</dt>
                  <dd class="mt-1">
                    <VaChip :color="group.is_archived ? 'secondary' : 'success'" size="small">
                      {{ group.is_archived ? 'Archived' : 'Active' }}
                    </VaChip>
                  </dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Description</dt>
                  <dd class="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    {{ group.description || '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Group ID</dt>
                  <dd class="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 select-all">{{ group.id }}</dd>
                </div>
                <div v-if="group.created_at">
                  <dt class="text-xs font-semibold uppercase tracking-wide" style="color: var(--va-secondary)">Created</dt>
                  <dd class="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    {{ new Date(group.created_at).toLocaleDateString() }}
                  </dd>
                </div>
              </dl>
            </VaCardContent>
          </VaCard>
        </template>

        <!-- ── Members Tab ───────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'members'">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Members</h2>
            <VaButton
              v-if="canMutate"
              preset="primary"
              size="small"
              icon="person_add"
              @click="showAddMemberModal = true"
            >
              Add Member
            </VaButton>
          </div>

          <GroupMemberTable
            :members="groupsStore.members"
            :loading="groupsStore.membersLoading"
            :can-mutate="canMutate"
            :oversight-only="isOversightOnly"
            @remove="handleRemoveMember"
          />

          <UserSearchModal
            v-model="showAddMemberModal"
            :loading="addingMember"
            @add="handleAddMember"
          />
        </template>

        <!-- ── Admins Tab ────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'admins'">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Admins</h2>
          </div>

          <!-- Loading -->
          <VaSkeleton v-if="adminsLoading" variant="rounded" height="160px" />
          <template v-else>
            <!-- Empty state -->
            <div
              v-if="admins.length === 0"
              class="flex flex-col items-center py-8 gap-2 text-center"
            >
              <i-mdi-shield-account-outline class="text-4xl text-gray-300 dark:text-gray-600" />
              <p class="text-sm" style="color: var(--va-secondary)">No admins found.</p>
            </div>

            <VaDataTable
              v-else
              :items="admins"
              :columns="adminColumns"
              hoverable
              striped
            >
              <template #cell(username)="{ row }">
                <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {{ row.rowData.user?.name ?? row.rowData.user?.username }}
                </span>
                <span class="text-xs ml-1" style="color: var(--va-secondary)">
                  ({{ row.rowData.user?.username }})
                </span>
              </template>
              <template #cell(actions)="{ row }">
                <div v-if="canMutate && !isOversightOnly" class="flex items-center gap-1">
                  <VaButton
                    preset="plain"
                    color="warning"
                    size="small"
                    icon="person_remove"
                    :title="`Demote ${row.rowData.user?.username} from admin`"
                    :loading="demotingId === row.rowData.user?.id"
                    @click="handleDemoteAdmin(row.rowData)"
                  />
                </div>
              </template>
            </VaDataTable>
          </template>

          <!-- Promote member to admin -->
          <div v-if="canMutate && !isOversightOnly" class="mt-4">
            <VaButton
              preset="secondary"
              size="small"
              @click="showPromoteModal = true"
            >
            <div class="flex items-center gap-1">
              <i-mdi-shield-account class="mr-1" />
              <span> Promote Member to Admin </span>
            </div>
            </VaButton>
          </div>

          <UserSearchModal
            v-model="showPromoteModal"
            :loading="promotingAdmin"
            @add="handlePromoteAdmin"
          />
        </template>

        <!-- ── Owned Datasets Tab ────────────────────────────────────── -->
        <template v-else-if="activeTab === 'datasets'">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Owned Datasets</h2>
          </div>

          <VaSkeleton v-if="datasetsLoading" variant="rounded" height="160px" />
          <template v-else>
            <div
              v-if="ownedDatasets.length === 0"
              class="flex flex-col items-center py-8 gap-2 text-center"
            >
              <i-mdi-database-outline class="text-4xl text-gray-300 dark:text-gray-600" />
              <p class="text-sm" style="color: var(--va-secondary)">No datasets owned by this group.</p>
            </div>

            <VaDataTable
              v-else
              :items="ownedDatasets"
              :columns="datasetColumns"
              hoverable
              striped
            >
              <template #cell(name)="{ row }">
                <RouterLink
                  v-if="canMutate"
                  :to="`/v2/datasets/${row.rowData.id}`"
                  class="text-sm hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ row.rowData.name }}
                </RouterLink>
                <span v-else class="text-sm text-gray-900 dark:text-gray-100">
                  {{ row.rowData.name }}
                </span>
              </template>
              <template #cell(type)="{ row }">
                <VaChip color="info" size="small">{{ row.rowData.type ?? '—' }}</VaChip>
              </template>
            </VaDataTable>
          </template>
        </template>

        <!-- ── Owned Collections Tab ─────────────────────────────────── -->
        <template v-else-if="activeTab === 'collections'">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Owned Collections</h2>
          </div>

          <VaSkeleton v-if="collectionsLoading" variant="rounded" height="160px" />
          <template v-else>
            <div
              v-if="ownedCollections.length === 0"
              class="flex flex-col items-center py-8 gap-2 text-center"
            >
              <i-mdi-folder-multiple-outline class="text-4xl text-gray-300 dark:text-gray-600" />
              <p class="text-sm" style="color: var(--va-secondary)">No collections owned by this group.</p>
            </div>

            <VaDataTable
              v-else
              :items="ownedCollections"
              :columns="collectionColumns"
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
            </VaDataTable>
          </template>
        </template>

        <!-- ── Activity Log Tab ──────────────────────────────────────── -->
        <template v-else-if="activeTab === 'activity'">
          <VaCard>
            <VaCardContent>
              <div class="flex flex-col items-center py-10 gap-2 text-center">
                <i-mdi-history class="text-4xl text-gray-300 dark:text-gray-600" />
                <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Activity log coming soon.
                </p>
                <p class="text-xs" style="color: var(--va-secondary)">
                  Audit log endpoint not yet exposed.
                </p>
              </div>
            </VaCardContent>
          </VaCard>
        </template>

        <!-- ── Settings Tab ──────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'settings' && canEdit">
          <div class="flex flex-col gap-6">
            <!-- Edit Metadata -->
            <VaCard>
              <VaCardTitle>Edit Group Metadata</VaCardTitle>
              <VaCardContent>
                <form class="flex flex-col gap-4" @submit.prevent="handleSaveMetadata">
                  <VaInput
                    v-model="editForm.name"
                    label="Group Name"
                    required
                  />
                  <VaTextarea
                    v-model="editForm.description"
                    label="Description"
                    rows="3"
                  />
                  <div class="flex justify-end">
                    <VaButton
                      type="submit"
                      preset="primary"
                      :loading="savingMetadata"
                      :disabled="!editForm.name.trim()"
                    >
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
                      {{ group.is_archived ? 'Unarchive this group' : 'Archive this group' }}
                    </p>
                    <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                      {{
                        group.is_archived
                          ? 'Restore this group. Only platform admins can unarchive.'
                          : 'Soft-delete this group. Can be reversed by a platform admin.'
                      }}
                    </p>
                  </div>
                  <VaButton
                    v-if="!group.is_archived"
                    preset="plain"
                    color="danger"
                    icon="archive"
                    @click="showArchiveModal = true"
                  >
                    Archive Group
                  </VaButton>
                  <VaButton
                    v-else-if="auth.canAdmin"
                    preset="plain"
                    color="success"
                    icon="unarchive"
                    @click="showUnarchiveModal = true"
                  >
                    Unarchive Group
                  </VaButton>
                </div>
              </VaCardContent>
            </VaCard>
          </div>
        </template>
      </div>
    </template>
  </div>

  <!-- ── Archive / Unarchive confirmation modals ────────────────────── -->
  <ArchiveConfirmModal
    v-model="showArchiveModal"
    :group-name="group?.name"
    :loading="archiving"
    @confirm="handleArchive"
  />
  <ArchiveConfirmModal
    v-model="showUnarchiveModal"
    :group-name="group?.name"
    :unarchive="true"
    :loading="archiving"
    @confirm="handleUnarchive"
  />
</template>

<script setup>
import GroupService from '@/services/v2/groups'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/v2/groups'
import { useToast } from 'vuestic-ui'

// ── Props (from file-based router, `id` segment) ──────────────────────────
const props = defineProps({
  id: { type: String, required: true },
})

const auth = useAuthStore()
const groupsStore = useGroupsStore()
const { init: toast } = useToast()

// ── Computed: group shorthand ─────────────────────────────────────────────
const group = computed(() => groupsStore.selectedGroup)

// ── Authority helpers ─────────────────────────────────────────────────────
/**
 * Caller is a direct admin of this group or a platform admin.
 * Controls whether mutation buttons (Add Member, Demote, Archive, etc.) appear.
 */
const isDirectAdmin = computed(() =>
  auth.canAdmin || group.value?.caller_role === 'ADMIN',
)

/** Caller is an ancestor admin only (oversight visibility, no mutations). */
const isOversightOnly = computed(() =>
  !auth.canAdmin &&
  group.value?.caller_role === 'OVERSIGHT',
)

/** Caller can mutate this group (direct admin or platform admin). */
const canMutate = computed(() => isDirectAdmin.value && !isOversightOnly.value)

/** Caller can see the Settings tab. */
const canEdit = computed(() => isDirectAdmin.value)

const authorityLabel = computed(() => {
  if (auth.canAdmin) return 'Platform Admin'
  const role = group.value?.caller_role
  if (role === 'ADMIN') return 'Admin'
  if (role === 'OVERSIGHT') return 'Oversight'
  return 'Member'
})

const authorityColorMap = {
  'Admin': 'primary',
  'Platform Admin': 'danger',
  'Oversight': 'warning',
  'Member': 'secondary',
}
const authorityColor = computed(() => authorityColorMap[authorityLabel.value] ?? 'secondary')

// ── Tabs ──────────────────────────────────────────────────────────────────
const activeTab = ref('overview')

// ── Admins tab state ──────────────────────────────────────────────────────
const admins = ref([])
const adminsLoading = ref(false)
const demotingId = ref(null)
const showPromoteModal = ref(false)
const promotingAdmin = ref(false)

const adminColumns = computed(() => {
  const cols = [{ key: 'username', label: 'Admin' }]
  if (canMutate.value) cols.push({ key: 'actions', label: '' })
  return cols
})

async function fetchAdmins() {
  adminsLoading.value = true
  try {
    // Filter members with ADMIN role from the full member list
    await groupsStore.fetchMembers(props.id)
    admins.value = groupsStore.members.filter((m) => m.role === 'ADMIN')
  } finally {
    adminsLoading.value = false
  }
}

async function handleDemoteAdmin(user) {
  demotingId.value = user.user?.id
  try {
    await GroupService.removeAdmin(props.id, user.user?.id)
    toast({ message: `${user.user?.username} demoted from admin.`, color: 'success', position: 'bottom-right' })
    fetchAdmins()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to demote admin.', color: 'danger', position: 'bottom-right' })
  } finally {
    demotingId.value = null
  }
}

async function handlePromoteAdmin(user) {
  promotingAdmin.value = true
  try {
    await GroupService.promoteToAdmin(props.id, user.id)
    toast({ message: `${user.username} promoted to admin.`, color: 'success', position: 'bottom-right' })
    showPromoteModal.value = false
    fetchAdmins()
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to promote to admin.', color: 'danger', position: 'bottom-right' })
  } finally {
    promotingAdmin.value = false
  }
}

// ── Members tab helpers ───────────────────────────────────────────────────
const showAddMemberModal = ref(false)
const addingMember = ref(false)

async function handleAddMember(user) {
  addingMember.value = true
  try {
    await GroupService.addMember(props.id, user.id)
    toast({ message: `${user.username} added to group.`, color: 'success', position: 'bottom-right' })
    showAddMemberModal.value = false
    groupsStore.fetchMembers(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to add member.', color: 'danger', position: 'bottom-right' })
  } finally {
    addingMember.value = false
  }
}

async function handleRemoveMember(user) {
  try {
    await GroupService.removeMember(props.id, user.user?.id)
    toast({ message: `${user.user?.username} removed from group.`, color: 'success', position: 'bottom-right' })
    groupsStore.fetchMembers(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to remove member.', color: 'danger', position: 'bottom-right' })
  }
}

// ── Owned Datasets tab ────────────────────────────────────────────────────
const ownedDatasets = ref([])
const datasetsLoading = ref(false)

const datasetColumns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'type', label: 'Type' },
]

async function fetchDatasets() {
  datasetsLoading.value = true
  try {
    const { data: { data: items } } = await GroupService.getDatasets(props.id)
    ownedDatasets.value = items
  } catch {
    ownedDatasets.value = []
  } finally {
    datasetsLoading.value = false
  }
}

// ── Owned Collections tab ─────────────────────────────────────────────────
const ownedCollections = ref([])
const collectionsLoading = ref(false)

const collectionColumns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'description', label: 'Description' },
]

async function fetchCollections() {
  collectionsLoading.value = true
  try {
    const { data: { data: items } } = await GroupService.getCollections(props.id)
    ownedCollections.value = items
  } catch {
    ownedCollections.value = []
  } finally {
    collectionsLoading.value = false
  }
}

// ── Settings tab ──────────────────────────────────────────────────────────
const editForm = reactive({ name: '', description: '' })
const savingMetadata = ref(false)
const showArchiveModal = ref(false)
const showUnarchiveModal = ref(false)
const archiving = ref(false)

function syncEditForm() {
  if (group.value) {
    editForm.name = group.value.name ?? ''
    editForm.description = group.value.description ?? ''
  }
}

async function handleSaveMetadata() {
  if (!editForm.name.trim()) return
  savingMetadata.value = true
  try {
    await GroupService.update(
      props.id,
      { name: editForm.name.trim(), description: editForm.description.trim() || undefined },
      group.value.version,
    )
    toast({ message: 'Group updated.', color: 'success', position: 'bottom-right' })
    groupsStore.fetchGroup(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to update group.', color: 'danger', position: 'bottom-right' })
  } finally {
    savingMetadata.value = false
  }
}

async function handleArchive() {
  archiving.value = true
  try {
    await GroupService.archive(props.id)
    toast({ message: 'Group archived.', color: 'success', position: 'bottom-right' })
    showArchiveModal.value = false
    groupsStore.fetchGroup(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to archive group.', color: 'danger', position: 'bottom-right' })
  } finally {
    archiving.value = false
  }
}

async function handleUnarchive() {
  archiving.value = true
  try {
    await GroupService.unarchive(props.id)
    toast({ message: 'Group unarchived.', color: 'success', position: 'bottom-right' })
    showUnarchiveModal.value = false
    groupsStore.fetchGroup(props.id)
  } catch (err) {
    toast({ message: err?.response?.data?.message ?? 'Failed to unarchive group.', color: 'danger', position: 'bottom-right' })
  } finally {
    archiving.value = false
  }
}

// ── Lazy-load tab data ────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'members') groupsStore.fetchMembers(props.id)
  if (tab === 'admins') fetchAdmins()
  if (tab === 'datasets') fetchDatasets()
  if (tab === 'collections') fetchCollections()
  if (tab === 'settings') syncEditForm()
})

// Watch for group data to sync edit form when settings tab is already active
watch(group, () => {
  if (activeTab.value === 'settings') syncEditForm()
})

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  groupsStore.clearSelectedGroup()
  await groupsStore.fetchGroup(props.id)
  await groupsStore.fetchAncestors(props.id)
  // Eagerly load members for initial Overview / Members renders
  groupsStore.fetchMembers(props.id)
})

onUnmounted(() => {
  groupsStore.clearSelectedGroup()
})
</script>
