<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3 max-w-5xl mx-auto">
      <!-- Header row -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- Search input -->
            <div class="flex-1">
              <Searchbar v-model="searchTerm" placeholder="Search subgroups…" />
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
              size="small"
              color="success"
              preset="primary"
              @click="handleCreateSubgroup"
              v-if="props.canCreate"
            >
              <div class="flex items-center justify-between gap-2 mx-1">
                <i-mdi-plus class="text-sm" />
                Create Sub Group
              </div>
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>

      <VaCard class="min-h-[360px]">
        <VaCardContent>
          <Transition name="fade-slide" mode="out-in">
            <!-- Error state -->
            <div v-if="error" class="py-12 px-6">
              <ErrorState
                title="Failed to load subgroups"
                :message="error?.message"
                @retry="fetchSubgroups"
              />
            </div>

            <!-- Empty state (filtered results) -->
            <div
              v-else-if="subgroups.length === 0 && !loading && areFiltersActive"
              class="py-12 px-6"
            >
              <EmptyState
                title="No results found"
                message="Try adjusting your filters."
                @reset="resetFilters"
              />
            </div>

            <!-- No data state -->
            <div
              v-else-if="
                subgroups.length === 0 && !loading && !areFiltersActive
              "
              class="flex flex-col items-center justify-center gap-4 py-12"
            >
              <div class="flex items-center justify-center">
                <i-mdi-folder-multiple
                  class="text-5xl text-gray-400 dark:text-gray-500"
                />
              </div>

              <div
                class="text-center max-w-md space-y-3 text-gray-900 dark:text-gray-100"
              >
                <h3 class="font-semibold tracking-tight">No subgroups</h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  <template v-if="props.canCreate">
                    This group currently has no subgroups. Create the first
                    subgroup to get started.
                  </template>
                </p>
              </div>

              <VaButton v-if="props.canCreate" @click="handleCreateSubgroup">
                <div class="flex items-center gap-3 px-2">
                  <i-mdi-plus class="text-lg" />
                  <span class="font-medium">Create Subgroup</span>
                </div>
              </VaButton>
            </div>

            <!-- Table -->
            <VaDataTable
              v-else-if="subgroups.length > 0"
              :items="subgroups"
              :columns="columns"
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
          </Transition>
        </VaCardContent>
      </VaCard>
    </div>
  </VaInnerLoading>
  <GroupCreateModal
    ref="createEditModal"
    :is-subgroup="true"
    :parent-group="props.group"
    @update="handleSubgroupCreated"
  />
</template>

<script setup>
import GroupService from "@/services/v2/groups";

const props = defineProps({
  group: { type: Object, required: true },
  canCreate: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const subgroups = ref([]);
const error = ref(null);
const loading = ref(true);
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

function setScope(value) {
  activeScope.value = value;
}

watch([searchTerm, activeScope], () => {
  fetchSubgroups();
});

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
    const { data } = await GroupService.getDescendants(props.group.id, params);
    subgroups.value = Array.isArray(data) ? data : [];
    error.value = null;
  } catch (err) {
    error.value = err;
    subgroups.value = [];
  } finally {
    loading.value = false;
  }
}

const createEditModal = ref(null);
function handleCreateSubgroup() {
  createEditModal.value?.show();
}

function resetFilters() {
  searchTerm.value = "";
  setScope("all");
}

function handleSubgroupCreated() {
  // Refresh the list to include the newly created subgroup
  fetchSubgroups();

  // Optionally, emit an event to update subgroup count in parent component
  emit("count-changed");
}

onMounted(() => fetchSubgroups());
</script>

<style scoped>
.card.header {
  --va-card-padding: 0.8rem;
}
</style>
