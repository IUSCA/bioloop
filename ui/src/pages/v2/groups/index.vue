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
        @click="openCreateGroupModal"
      >
        Create Group
      </VaButton>
    </div>

    <!-- ── Filters ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search input -->
      <div class="flex-1">
        <Searchbar
          v-model="searchTerm"
          placeholder="Search groups…"
          :disabled="loading"
        />
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
          :disabled="loading"
          @click="!loading && setScope(f.value)"
        >
          {{ f.label }}
        </VaChip>
      </div>
    </div>

    <!-- ── Results ──────────────────────────────────────────────────── -->

    <Transition name="fade-slide" mode="out-in">
      <!-- Loading skeleton -->
      <div
        v-if="loading"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <VaSkeleton v-for="n in 9" :key="n" variant="rounded" height="96px" />
      </div>

      <!-- Error -->
      <div v-else-if="error?.message" class="py-12 px-6">
        <ErrorState
          :title="'Failed to load groups'"
          :message="error?.message"
          @retry="fetchGroups"
        />
      </div>

      <!-- Empty state -->
      <div v-else-if="groups.length === 0" class="py-12 px-6">
        <EmptyState
          title="No groups found"
          message="Try adjusting your search or filters to find what you're looking for."
          @reset="resetFilters"
        />
      </div>

      <!-- results -->
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
    </Transition>
  </div>
  <GroupCreateModal ref="groupCreateModal" @update="fetchGroups" />
</template>

<script setup>
import GroupService from "@/services/v2/groups";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

// ── State ─────────────────────────────────────────────────────────────────
const searchTerm = ref("");
const activeScope = ref("mine"); // 'mine' | 'admin' | 'oversight' | 'all'

const loading = ref(true);
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
      params.scope = "direct";
    } else if (activeScope.value === "admin") {
      params.scope = "admin";
    } else if (activeScope.value === "oversight") {
      params.scope = "oversight";
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

function setScope(scope) {
  activeScope.value = scope;
}

watch([searchTerm, activeScope], () => {
  if (currentPage.value == 1) {
    // If we're already on the first page, just refetch. Otherwise,
    // go back to page 1 which will trigger a fetch via the watcher.
    fetchGroups();
    return;
  }
  currentPage.value = 1;
});

function resetFilters() {
  searchTerm.value = "";
  activeScope.value = auth.canAdmin ? "all" : "mine";
}

watch(currentPage, () => {
  fetchGroups();
});

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  // Default scope: platform admins see all, others see mine
  activeScope.value = auth.canAdmin ? "all" : "mine";
  fetchGroups();
});

const groupCreateModal = ref(null);
function openCreateGroupModal() {
  groupCreateModal.value?.show();
}
</script>

<route lang="yaml">
meta:
  title: Groups
  nav: [{ label: "Groups" }]
</route>
