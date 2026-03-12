<template>
  <VaInnerLoading :loading="loading">
    <div class="flex flex-col gap-4">
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
      <ErrorState v-if="error" :error="error" @retry="fetchSubgroups" />

      <!-- Empty state -->
      <EmptyState
        v-else-if="subgroups.length === 0"
        title="No subgroups found"
        message="Try expanding your search or adjusting the scope filter."
        @reset="resetFilters"
      />

      <!-- Table -->
      <VaDataTable
        v-else
        :items="subgroups"
        :columns="columns"
        hoverable
        striped
      >
        <template #cell(name)="{ row }">
          <RouterLink
            :to="`/v2/groups/${row.rowData.id}`"
            class="text-sm font-medium hover:underline"
            style="color: var(--va-primary)"
          >
            {{ row.rowData.name }}
          </RouterLink>
        </template>

        <template #cell(description)="{ row }">
          <span class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
            {{ row.rowData.description || "—" }}
          </span>
        </template>

        <template #cell(status)="{ row }">
          <VaChip
            :color="row.rowData.is_archived ? 'secondary' : 'success'"
            size="small"
          >
            {{ row.rowData.is_archived ? "Archived" : "Active" }}
          </VaChip>
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
