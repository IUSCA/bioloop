<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3">
      <!-- Header row -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- Search input -->
            <div class="flex-1">
              <Searchbar v-model="searchTerm" placeholder="Search subgroups…" />
            </div>

            <ModernButtonToggle
              :model-value="activeScope"
              label="Depth"
              :options="scopeFilters"
              text-by="label"
              value-by="value"
              color="primary"
              size="sm"
              @update:model-value="setScope"
            />

            <VaButton
              size="small"
              color="success"
              preset="primary"
              :disabled="!stateAdmits('create_child')"
              :title="stateAdmits('create_child') ? null : DISABLED_REASON"
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
                :error="error"
                subject="these subgroups"
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
              class="py-12 px-6"
            >
              <EmptyState
                icon="mdi-folder-multiple"
                title="No subgroups"
                :show-clear-filters="false"
              >
                <template #message>
                  <template v-if="props.canCreate">
                    This group currently has no subgroups. Create the first
                    subgroup to get started.
                  </template>
                </template>
                <template v-if="props.canCreate" #actions>
                  <VaButton
                    :disabled="!stateAdmits('create_child')"
                    :title="
                      stateAdmits('create_child') ? null : DISABLED_REASON
                    "
                    @click="handleCreateSubgroup"
                  >
                    <div class="flex items-center gap-3 px-2">
                      <i-mdi-plus class="text-lg" />
                      <span class="font-medium">Create Subgroup</span>
                    </div>
                  </VaButton>
                </template>
              </EmptyState>
            </div>

            <!-- Table -->
            <VaDataTable
              v-else-if="subgroups.length > 0"
              class="v2-table"
              :items="subgroups"
              :columns="columns"
              striped
            >
              <template #cell(name)="{ rowData }">
                <RouterLink :to="`/v2/groups/${rowData.id}`" class="text-sm">
                  {{ rowData.name }}
                </RouterLink>
              </template>

              <template #cell(tagline)="{ value }">
                <span class="text-sm va-text-secondary line-clamp-2">
                  {{ value || "—" }}
                </span>
              </template>

              <template #cell(status)="{ rowData }">
                <Badge :color="rowData.is_archived ? 'neutral' : 'success'">
                  {{ rowData.is_archived ? "Archived" : "Active" }}
                </Badge>
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
  /**
   * `_meta.available_actions`: what the group's own state admits right now, or null when the
   * response did not say. A control the state withholds stays visible and disabled, because
   * the caller keeps the authority and will hold it again.
   *
   * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
   */
  availableActions: { type: Array, default: null },
});

/**
 * Whether the group's state admits the action.
 *
 * A null list means the response did not answer, and every control stays usable: the service
 * checks the state again under its own lock, so a wrongly enabled control costs a 409 rather
 * than a wrong write.
 */
function stateAdmits(action) {
  return props.availableActions === null
    ? true
    : props.availableActions.includes(action);
}

/** The words a disabled control shows for why the state withholds it. */
const DISABLED_REASON = "This group is archived.";

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
    key: "tagline",
    label: "Tagline",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;", // wrap cell contents
  },
  { key: "status", label: "Status" },
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

defineExpose({
  openCreateModal: handleCreateSubgroup,
});
</script>
