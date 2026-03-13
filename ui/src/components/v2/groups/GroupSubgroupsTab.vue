<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-4 max-w-4xl mx-auto min-h-[200px]">
      <!-- Header row -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Search input -->
        <div class="flex-1">
          <va-input
            v-model="searchTerm"
            class="w-full"
            placeholder="Search subgroups…"
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

        <VaButton size="small" @click="handleCreateSubgroup" disabled>
          <div class="flex items-center justify-between gap-2 mx-1">
            <i-mdi-plus class="text-sm" />
            Create Sub Group
          </div>
        </VaButton>
      </div>

      <!-- Error state -->
      <ErrorState
        v-if="error"
        title="Failed to load subgroups"
        :message="error?.message"
        @retry="fetchSubgroups"
      />

      <!-- Empty state (filtered results) -->
      <EmptyState
        v-else-if="subgroups.length === 0 && !loading && areFiltersActive"
        title="No results found"
        message="Try adjusting your filters."
        @reset="resetFilters"
      />

      <!-- No data state -->
      <div
        v-else-if="subgroups.length === 0 && !loading && !areFiltersActive"
        class="flex flex-col items-center justify-center gap-4 py-12"
      >
        <div class="text-center">
          <h3 class="text-lg font-semibold mb-2">
            No subgroups have been created yet.
          </h3>
        </div>
        <VaButton @click="handleCreateSubgroup" disabled>
          <div class="flex items-center justify-between gap-2 mx-1">
            <i-mdi-plus class="text-sm" />
            Create Sub Group
          </div>
        </VaButton>
      </div>

      <!-- Table -->
      <VaDataTable
        v-else
        :items="subgroups"
        :columns="columns"
        hoverable
        striped
      >
        <template #cell(name)="{ rowData }">
          <RouterLink :to="`/v2/groups/${rowData.id}`" class="text-sm">
            {{ rowData.name }}
          </RouterLink>
        </template>

        <template #cell(description)="{ value }">
          <span class="text-sm va-text-secondary line-clamp-2">
            {{ value || "—" }}
          </span>
        </template>

        <template #cell(status)="{ rowData }">
          <ModernChip
            :color="rowData.is_archived ? 'secondary' : 'success'"
            size="small"
          >
            {{ rowData.is_archived ? "Archived" : "Active" }}
          </ModernChip>
        </template>
      </VaDataTable>
    </div>
  </VaInnerLoading>
</template>

<script setup>
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";

const props = defineProps({
  groupId: { type: String, required: true },
});

// const emit = defineEmits(["count-changed"]);

const subgroups = ref([]);
const error = ref(null);
const loading = ref(false);
const activeScope = ref("all"); // 'all' | 'direct'
const searchTerm = ref("");

const areFiltersActive = computed(() => {
  return searchTerm.value !== "" || activeScope.value !== "all";
});

const scopeFilters = [
  { label: "All Descendants", value: "all" },
  { label: "Immediate Children", value: "direct" },
];

const columns = [
  { key: "name", label: "Name" },
  {
    key: "description",
    label: "Description",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;", // wrap cell contents
  },
  { key: "status", label: "Status", width: "120px" },
];

const debouncedFetch = useDebounceFn(() => {
  fetchSubgroups();
}, 350);

function setScope(value) {
  activeScope.value = value;
  fetchSubgroups();
}

async function fetchSubgroups() {
  loading.value = true;
  try {
    const params = {};
    if (searchTerm.value) {
      params.search_term = searchTerm.value;
    }
    if (activeScope.value === "direct") {
      params.max_depth = 1;
    }
    const { data } = await GroupService.getDescendants(props.groupId, params);
    subgroups.value = Array.isArray(data) ? data : [];
    error.value = null;
  } catch (err) {
    error.value = err;
    subgroups.value = [];
  } finally {
    loading.value = false;
  }
}

function handleCreateSubgroup() {
  toast.info("Create sub group button clicked");
  // TODO: implement create subgroup flow
  // emit("count-changed");
}

function resetFilters() {
  searchTerm.value = "";
  setScope("all");
}

onMounted(() => fetchSubgroups());
</script>
