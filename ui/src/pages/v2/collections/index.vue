<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3 max-w-7xl mx-auto">
      <!-- Header row -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-5">
              <!-- Search input -->
              <div class="flex-1">
                <Searchbar
                  v-model="searchTerm"
                  placeholder="Search collections…"
                />
              </div>

              <VaButton @click="navigateToCreateCollection" v-if="canCreate">
                <div class="flex items-center justify-between gap-2 mx-1">
                  <i-mdi-plus class="text-sm" />
                  Create Collection
                </div>
              </VaButton>
            </div>

            <!-- filters -->
            <div class="flex items-center gap-5">
              <!-- Scope filter chips -->
              <ModernButtonToggle
                v-model="activeScope"
                label="Access via"
                :options="scopeFilters"
                text-by="label"
                value-by="value"
                color="blue"
                size="sm"
              />

              <!-- Status filter chips -->
              <ModernButtonToggle
                v-model="activeStatus"
                label="Status"
                :options="statusFilters"
                text-by="label"
                value-by="value"
                color="blue"
                size="sm"
              />
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- keeps layout stable when swapping views -->
      <VaCard class="min-h-[360px]">
        <VaCardContent>
          <Transition name="fade-slide" mode="out-in">
            <div v-if="error" class="py-12 px-6">
              <ErrorState
                title="Failed to load collections"
                :message="error?.message"
                @retry="fetchCollections"
              />
            </div>

            <!-- results -->
            <div v-else-if="collections.length > 0">
              <VaDataTable
                :items="collections"
                :columns="columns"
                class="collections-table"
                v-model:sort-by="sortBy"
                v-model:sorting-order="sortOrder"
                disable-client-side-sorting
              >
                <template #cell(name)="{ row }">
                  <RouterLink
                    :to="`/v2/collections/${row.rowData.id}`"
                    class="text-sm font-medium hover:underline"
                    style="color: var(--va-primary)"
                  >
                    {{ row.rowData.name }}
                  </RouterLink>
                </template>

                <template #cell(description)="{ value }">
                  <span class="text-sm va-text-secondary line-clamp-1">
                    {{ value || "—" }}
                  </span>
                </template>

                <template #cell(owner_group)="{ rowData }">
                  <div
                    class="flex items-center gap-[0.4rem]"
                    :title="rowData.owner_group?.name"
                  >
                    <GroupIcon
                      :group="rowData.owner_group"
                      size="xs"
                      class="flex-shrink-0 min-w-0"
                    />
                    <RouterLink
                      :to="`/v2/groups/${rowData.owner_group?.id}`"
                      class="text-sm hover:underline va-text-secondary"
                    >
                      {{ rowData.owner_group?.name || "—" }}
                    </RouterLink>
                  </div>
                </template>

                <template #cell(size)="{ rowData }">
                  <span class="text-sm">
                    {{
                      rowData?._count?.datasets != null
                        ? number_formatter.format(rowData._count.datasets)
                        : "—"
                    }}
                  </span>
                </template>

                <template #cell(created_at)="{ value }">
                  <span class="text-sm">
                    {{ datetime.date(value) }}
                  </span>
                </template>

                <template #cell(updated_at)="{ value }">
                  <span class="text-sm va-text-secondary">
                    {{ datetime.fromNowShort(value) }}
                  </span>
                </template>

                <template #cell(status)="{ rowData }">
                  <ModernChip
                    :color="rowData.is_archived ? 'secondary' : 'success'"
                    size="small"
                    outline
                  >
                    {{ rowData.is_archived ? "Archived" : "Active" }}
                  </ModernChip>
                </template>
              </VaDataTable>

              <Pagination
                class="mt-5 px-5"
                v-model:page="currentPage"
                v-model:page_size="itemsPerPage"
                :total_results="total"
                :curr_items="collections.length"
                :page_size_options="ITEMS_PER_PAGE_OPTIONS"
              />
            </div>

            <!-- empty state (filtered results) -->
            <div v-else-if="!loading && areFiltersActive" class="py-12 px-6">
              <EmptyState
                title="No results found"
                message="Try adjusting your filters."
                @reset="resetFilters"
              />
            </div>

            <!-- no data state -->
            <div
              v-else-if="!loading && !areFiltersActive"
              class="flex flex-col items-center justify-center gap-8 py-12 px-6"
            >
              <div class="flex items-center justify-center">
                <i-mdi-folder-multiple
                  class="text-5xl text-gray-400 dark:text-gray-500"
                />
              </div>

              <div
                class="text-center max-w-md space-y-3 text-gray-900 dark:text-gray-100"
              >
                <h3 class="font-semibold tracking-tight">
                  No collections available
                </h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  <template v-if="canCreate">
                    This group has no collections yet. Add the first collection
                    to get started.
                  </template>
                  <template v-else>
                    No collections are currently available to you in this group.
                    This group may have no collections, or you may not have been
                    granted access. Contact your group administrator for
                    assistance.
                  </template>
                </p>
              </div>

              <VaButton v-if="canCreate" @click="navigateToCreateCollection">
                <div class="flex items-center gap-3 px-2">
                  <i-mdi-plus class="text-lg" />
                  <span class="font-medium">Create Collection</span>
                </div>
              </VaButton>
            </div>
          </Transition>
        </VaCardContent>
      </VaCard>
    </div>
  </VaInnerLoading>
  <CollectionCreateModal
    ref="collectionCreateModal"
    @update="fetchCollections"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import CollectionService from "@/services/v2/collections";
import { useUIPersonaStore } from "@/stores/v2/uiPersona";

const uiPersonaStore = useUIPersonaStore();
const canCreate = computed(
  () => uiPersonaStore.isPlatformAdmin || uiPersonaStore.isGroupAdmin,
);

// const props = defineProps({});
// data
const collections = ref([]);
const error = ref(null);
const loading = ref(true);

// filters
const activeScope = ref("all"); // 'ownership' | 'grants' | 'oversight' | 'all'
const activeStatus = ref("all"); // 'all' | 'active' | 'archived'
const searchTerm = ref("");

// pagination & sorting
const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref("created_at");
const sortOrder = ref("desc");

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

const number_formatter = Intl.NumberFormat("en");

const areFiltersActive = computed(() => {
  return (
    searchTerm.value !== "" ||
    activeStatus.value !== "all" ||
    activeScope.value !== "all"
  );
});

const scopeFilters = [
  { label: "All", value: "all" },
  { label: "Ownership", value: "ownership" },
  { label: "Grants", value: "grants" },
  { label: "Oversight", value: "oversight" },
];

const statusFilters = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

const columns = [
  { key: "name", label: "Name", sortable: true },
  {
    key: "owner_group",
    label: "Owner Group",
    width: "300px",
    tdClass: "truncate",
  },
  { key: "size", label: "Datasets", width: "80px", sortable: true },
  {
    key: "description",
    label: "Description",
    tdStyle: "line-clamp-2", // wrap cell contents
  },
  { key: "updated_at", label: "Last Updated", width: "120px", sortable: true },
  { key: "status", label: "Status", width: "100px" },
];

watch(
  [activeScope, activeStatus, itemsPerPage, searchTerm, sortBy, sortOrder],
  () => {
    if (currentPage.value !== 1) {
      currentPage.value = 1;
      return;
    }
    fetchCollections();
  },
);

watch(currentPage, fetchCollections);

async function fetchCollections() {
  loading.value = true;
  try {
    const { data } = await CollectionService.search({
      is_archived:
        activeStatus.value === "active"
          ? false
          : activeStatus.value === "archived"
            ? true
            : undefined,
      scope: activeScope.value !== "all" ? activeScope.value : undefined,
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
      search_term: searchTerm.value || undefined,
      sort_by: sortBy.value === "size" ? "_count.datasets" : sortBy.value,
      sort_order: sortOrder.value,
    });
    error.value = null;
    collections.value = data.data;

    total.value = data.metadata?.total ?? data.data.length;
  } catch (err) {
    error.value = err;
    collections.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// function handleNewCollection() {
//   emit("count-changed");
// }

function resetFilters() {
  searchTerm.value = "";
  activeScope.value = "all";
  activeStatus.value = "all";
}

onMounted(() => {
  fetchCollections();
});

const collectionCreateModal = ref(null);
function navigateToCreateCollection() {
  collectionCreateModal.value?.show();
}
</script>

<route lang="yaml">
meta:
  title: Collections
  nav: [{ label: "Collections" }]
</route>

<style scoped>
.collections-table {
  --va-data-table-cell-padding: 8px;
}
</style>
