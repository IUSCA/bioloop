<template>
  <div class="flex flex-col gap-5">
    <!-- Page header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <p class="">Browse and manage organizational groups.</p>
      </div>
      <!-- Create Group — platform admin only -->
      <VaButton
        v-if="auth.canAdmin"
        preset="primary"
        icon="add"
        @click="showCreateModal = true"
      >
        Create Group
      </VaButton>
    </div>

    <!-- ── Filters ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search input -->
      <div class="flex-1">
        <va-input
          v-model="searchTerm"
          class="w-full"
          placeholder="Search groups…"
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
    </div>

    <!-- ── Results ──────────────────────────────────────────────────── -->

    <!-- Loading skeleton -->
    <div
      v-if="loading"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <VaSkeleton v-for="n in 6" :key="n" variant="rounded" height="96px" />
    </div>

    <!-- Error -->
    <ErrorState
      v-else-if="error?.message"
      :title="'Failed to load groups'"
      :message="error?.message"
      @retry="fetchGroups"
    />

    <!-- Empty state -->
    <EmptyState
      v-else-if="groups.length === 0"
      title="No groups found"
      message="Try adjusting your search or filters to find what you're looking for."
      @reset="resetFilters"
    />

    <div v-else class="flex flex-col gap-6">
      <!-- Group cards grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <GroupCard v-for="group in groups" :key="group.id" :group="group" />
      </div>

      <!-- Pagination -->
      <Pagination
        v-model:page="currentPage"
        v-model:page_size="itemsPerPage"
        :total_results="total"
        :curr_items="groups.length"
      />
    </div>
  </div>

  <!-- ── Create Group Modal ─────────────────────────────────────────── -->
  <VaModal
    v-model="showCreateModal"
    title="Create Group"
    ok-text="Create"
    cancel-text="Cancel"
    :ok-disabled="!createForm.name.trim()"
    :loading="createLoading"
    @ok="handleCreate"
  >
    <div class="flex flex-col gap-4">
      <VaInput
        v-model="createForm.name"
        label="Group Name"
        placeholder="e.g. Research Lab Alpha"
        required
      />
      <VaTextarea
        v-model="createForm.description"
        label="Description"
        placeholder="Short description of this group's purpose (optional)"
        rows="3"
      />
    </div>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

// ── State ─────────────────────────────────────────────────────────────────
const searchTerm = ref("");
const activeScope = ref("mine"); // 'mine' | 'admin' | 'oversight' | 'all'

const loading = ref(false);
const error = ref(null);

const groups = ref([]);
const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(24);

const scopeFilters = [
  { label: "My Groups", value: "mine" },
  { label: "I Administer", value: "admin" },
  { label: "I Oversee", value: "oversight" },
  { label: "All Groups", value: "all" },
];

// ── Fetch ─────────────────────────────────────────────────────────────────
async function fetchGroups() {
  loading.value = true;
  error.value = null;
  try {
    const params = {
      search_term: searchTerm.value.trim(),
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
    };
    if (activeScope.value === "mine") {
      params.direct_membership_only = true;
    } else if (activeScope.value === "admin") {
      params.admin_only = true;
    } else if (activeScope.value === "oversight") {
      params.oversight_only = true;
    }
    const {
      data: { metadata, data: items },
    } = await GroupService.search(params);
    groups.value = items;
    total.value = metadata.total;
  } catch (err) {
    groups.value = [];
    total.value = 0;
    error.value = err;
  } finally {
    loading.value = false;
  }
}

const debouncedFetch = useDebounceFn(() => {
  if (currentPage.value == 1) {
    // If we're already on the first page, just refetch. Otherwise,
    // go back to page 1 which will trigger a fetch via the watcher.
    fetchGroups();
    return;
  }
  currentPage.value = 1;
}, 350);

function setScope(scope) {
  activeScope.value = scope;
  if (currentPage.value == 1) {
    // If we're already on the first page, just refetch. Otherwise,
    // go back to page 1 which will trigger a fetch via the watcher.
    fetchGroups();
    return;
  }
  currentPage.value = 1;
}

function resetFilters() {
  searchTerm.value = "";
  activeScope.value = auth.canAdmin ? "all" : "mine";

  if (currentPage.value == 1) {
    // If we're already on the first page, just refetch. Otherwise,
    // go back to page 1 which will trigger a fetch via the watcher.
    fetchGroups();
    return;
  }
  currentPage.value = 1;
}

watch(currentPage, () => {
  fetchGroups();
});

// ── Create Group ──────────────────────────────────────────────────────────
const showCreateModal = ref(false);
const createLoading = ref(false);
const createForm = reactive({ name: "", description: "" });

async function handleCreate() {
  if (!createForm.name.trim()) return;
  createLoading.value = true;
  try {
    await GroupService.create({
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
    });
    toast.success({
      message: `Group "${createForm.name}" created.`,
      color: "success",
      position: "bottom-right",
    });
    showCreateModal.value = false;
    createForm.name = "";
    createForm.description = "";
    fetchGroups();
  } catch (err) {
    toast.error({
      message: err?.response?.data?.message ?? "Failed to create group.",
      color: "danger",
      position: "bottom-right",
    });
  } finally {
    createLoading.value = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  // Default scope: platform admins see all, others see mine
  activeScope.value = auth.canAdmin ? "all" : "mine";
  fetchGroups();
});
</script>

<route lang="yaml">
meta:
  title: Groups
  nav: [{ label: "Groups" }]
</route>
