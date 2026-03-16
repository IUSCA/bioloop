<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3 max-w-5xl mx-auto">
      <!-- Header row -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- Search input -->
            <div class="flex-1">
              <va-input
                v-model="searchTerm"
                class="w-full"
                placeholder="Search group members…"
                outline
                clearable
                @update:model-value="debouncedFetch"
              >
                <template #prependInner>
                  <Icon icon="material-symbols:search" class="text-xl" />
                </template>
              </va-input>
            </div>

            <!-- Scope filter chips -->
            <div class="flex items-center gap-2">
              <VaChip
                v-for="f in scopeFilters"
                :key="f.value"
                :color="activeScope === f.value ? 'primary' : 'secondary'"
                class="cursor-pointer"
                size="small"
                :outline="activeScope !== f.value"
                @click="setScope(f.value)"
              >
                {{ f.label }}
              </VaChip>
            </div>

            <VaButton
              v-if="props.canAdd"
              size="small"
              @click="openAddMemberModal"
            >
              <div class="flex items-center justify-between gap-2 mx-1">
                <i-mdi-account-plus class="text-sm" />
                Add Member
              </div>
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>

      <VaCard class="content card min-h-[360px]">
        <VaCardContent>
          <Transition name="fade-slide" mode="out-in">
            <div v-if="error" class="py-12 px-6">
              <ErrorState
                title="Failed to load group members"
                :message="error?.message"
                @retry="fetchMembers"
              />
            </div>

            <div v-else-if="members.length > 0">
              <VaDataTable
                :items="members"
                :columns="columns"
                class="group-membership-table"
              >
                <template #cell(name)="{ rowData }">
                  <div class="flex items-center gap-3 text-sm">
                    <UserAvatar
                      :username="rowData.user.username"
                      :name="rowData.user.name"
                    />
                    <span> {{ rowData.user.name }} </span>
                  </div>
                </template>

                <template #cell(email)="{ rowData }">
                  <span
                    class="text-sm va-text-secondary"
                    :title="rowData.user.email"
                  >
                    {{ rowData.user.email }}
                  </span>
                </template>

                <template #cell(effective_role)="{ value }">
                  <GroupMemberRoleBadge :role-name="value" />
                </template>

                <template #cell(membership_via)="{ source }">
                  <div class="text-sm">
                    <span
                      v-if="source.type === 'DIRECT'"
                      class="text-[var(--va-success)]"
                    >
                      ● Direct
                    </span>
                    <span
                      v-else
                      class="text-[11px] text-slate-700 bg-slate-100 border border-solid border-slate-300 rounded-sm px-1.5 py-px inline-flex items-center gap-1 dark:text-slate-400 dark:bg-slate-900 dark:border-slate-700"
                    >
                      <span class="font-mono"> ↗ </span>
                      <span> via </span>
                      <RouterLink
                        :to="`/v2/groups/${source.id}`"
                        class="text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 max-w-24 truncate"
                      >
                        {{ source.name }}
                      </RouterLink>
                    </span>
                  </div>
                </template>

                <template #cell(assigned_at)="{ value }">
                  <span class="text-sm va-text-secondary">
                    {{ datetime.date(value) }}
                  </span>
                </template>

                <template #cell(actions)="{ rowData }">
                  <div v-if="rowData.effective_role !== 'TRANSITIVE_MEMBER'">
                    <VaButtonDropdown preset="primary" class="" size="small">
                      <div class="flex flex-col items-center gap-2">
                        <VaButton
                          v-if="props.canEditRole"
                          @click="handleEditRole(rowData)"
                          size="small"
                          preset="secondary"
                        >
                          <div class="flex items-center gap-1">
                            <i-mdi-pencil class="text-sm" />
                            Edit Role
                          </div>
                        </VaButton>

                        <VaButton
                          v-if="props.canRemove"
                          @click="handleRemove(rowData)"
                          size="small"
                          preset="secondary"
                          color="danger"
                        >
                          <div class="flex items-center gap-1">
                            <i-mdi-close class="text-sm" />
                            Remove
                          </div>
                        </VaButton>
                      </div>
                    </VaButtonDropdown>
                  </div>
                </template>
              </VaDataTable>

              <Pagination
                class="mt-5 px-5"
                v-model:page="currentPage"
                v-model:page_size="itemsPerPage"
                :total_results="total"
                :curr_items="members.length"
                :page_size_options="ITEMS_PER_PAGE_OPTIONS"
              />
            </div>

            <!-- no results after filtering -->
            <div v-else-if="!loading && areFiltersActive" class="py-12 px-6">
              <EmptyState
                title="No results found"
                message="Try adjusting your filters."
                @reset="resetFilters"
              />
            </div>

            <!-- no data -->
            <div
              v-else-if="!loading && !areFiltersActive"
              class="flex flex-col items-center justify-center gap-4 py-12 px-6"
            >
              <div class="flex items-center justify-center">
                <i-mdi-account-multiple
                  class="text-5xl text-gray-400 dark:text-gray-500"
                />
              </div>

              <div
                class="text-center max-w-md space-y-3 text-gray-900 dark:text-gray-100"
              >
                <h3 class="text font-semibold tracking-tight">
                  Group is currently empty
                </h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  <template v-if="props.canAdd">
                    This group currently has no members. Add the first member to
                    get started.
                  </template>
                </p>
              </div>

              <VaButton v-if="props.canAdd" @click="openAddMemberModal">
                <div class="flex items-center gap-3 px-2">
                  <i-mdi-plus class="text-lg" />
                  <span class="font-medium">Add Member</span>
                </div>
              </VaButton>
            </div>
          </Transition>
        </VaCardContent>
      </VaCard>
    </div>
  </VaInnerLoading>

  <AddGroupMemberModal
    ref="addMemberModal"
    :group-id="props.groupId"
    @update="handleMemberAdded"
  />

  <EditGroupMemberRoleModal
    ref="editRoleModal"
    :group-id="props.groupId"
    :member="selectedMember"
    @update="handleMemberAdded"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";
import { useModal, VaCardContent } from "vuestic-ui";

const { confirm } = useModal();

const props = defineProps({
  groupId: { type: String, required: true },
  canAdd: { type: Boolean, default: false },
  canRemove: { type: Boolean, default: false },
  canEditRole: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const members = ref([]);
const error = ref(null);
const loading = ref(true);
const activeScope = ref("all"); // 'all' | 'direct' | 'transitive'
const addMemberModal = ref(null);
const editRoleModal = ref(null);
const selectedMember = ref(null);

const searchTerm = ref("");
const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(20);
const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

const countsLoading = ref(false);
const countsError = ref(null);
const totalMembershipCount = ref(0);
const directMembershipCount = ref(0);
const transitiveMembershipCount = computed(
  () => totalMembershipCount.value - directMembershipCount.value,
);
const number_formatter = Intl.NumberFormat("en", { notation: "compact" });

function openAddMemberModal() {
  addMemberModal.value?.show?.();
}

function handleMemberAdded() {
  emit("count-changed");
  fetchMembers();
  fetchCounts();
}

const areFiltersActive = computed(() => {
  return searchTerm.value !== "" || activeScope.value !== "all";
});

const scopeFilters = computed(() => {
  const showCounts = !countsLoading.value && !countsError.value;
  const formatLabel = (label, count) =>
    showCounts ? `${label} (${number_formatter.format(count)})` : label;

  return [
    { label: formatLabel("All", totalMembershipCount.value), value: "all" },
    {
      label: formatLabel("Direct", directMembershipCount.value),
      value: "direct",
    },
    {
      label: formatLabel("Transitive", transitiveMembershipCount.value),
      value: "transitive",
    },
  ];
});

const columns = computed(() => {
  const baseColumns = [
    { key: "name" },
    { key: "email", label: "Email", width: "200px", tdClass: "truncate" },
    { key: "effective_role", label: "Role", width: "180px" },
    { key: "membership_via", label: "Membership", width: "180px" },
    { key: "assigned_at", label: "Joined", width: "70px" },
  ];

  if (props.canRemove || props.canEditRole) {
    baseColumns.push({
      key: "actions",
      label: " ",
      witch: "40px",
      tdClass: "flex items-center justify-end",
    });
  }

  return baseColumns;
});

const debouncedFetch = useDebounceFn(() => {
  if (currentPage.value == 1) {
    // If we're already on the first page, just refetch. Otherwise,
    // go back to page 1 which will trigger a fetch via the watcher.
    fetchMembers();
    return;
  }
  currentPage.value = 1;
}, 350);

function setScope(value) {
  activeScope.value = value;
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchMembers();
}

watch(itemsPerPage, () => {
  if (currentPage.value !== 1) {
    fetchMembers();
    return;
  }
  currentPage.value = 1;
});

watch(currentPage, fetchMembers);

async function fetchMembers() {
  loading.value = true;
  try {
    const { data } = await GroupService.getMembers(props.groupId, {
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
      membership_type:
        activeScope.value === "all" ? undefined : activeScope.value,
      search_term: searchTerm.value || undefined,
    });
    error.value = null;
    members.value = data.data;
    total.value = data.metadata.total;
  } catch (err) {
    error.value = err;
    members.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function fetchCounts() {
  countsLoading.value = true;
  GroupService.getMembers(props.groupId, {
    limit: 0,
    offset: 0,
  })
    .then(({ data }) => {
      countsError.value = null;
      totalMembershipCount.value = data.metadata.total;
      directMembershipCount.value = data.metadata.direct_membership;
    })
    .catch((err) => {
      countsError.value = err;
      console.error("Failed to fetch membership counts", err);
      totalMembershipCount.value = 0;
      directMembershipCount.value = 0;
    })
    .finally(() => {
      countsLoading.value = false;
    });
}

async function handleRemove(membership) {
  try {
    const result = await confirm({
      message: "Remove this member from the group?",
      title: "Are you sure?",
      okText: "Yes, remove",
      cancelText: "No, keep",
    });
    if (!result) return;

    await GroupService.removeMember(props.groupId, membership.user?.subject_id);
    toast.success(
      `${membership.user?.name ?? membership.user?.username} removed from group.`,
    );
    emit("count-changed");
    await fetchMembers();
  } catch (err) {
    toast.error(err?.response?.data?.message ?? "Failed to remove member.");
  }
}

function handleEditRole(member) {
  selectedMember.value = member;
  editRoleModal.value?.show?.();
}

function resetFilters() {
  searchTerm.value = "";
  setScope("all");
}

onMounted(() => {
  fetchMembers();
  fetchCounts();
});
</script>

<style scoped>
.group-membership-table {
  --va-data-table-cell-padding: 8px;
}
.card.header {
  --va-card-padding: 0.8rem;
}
</style>
