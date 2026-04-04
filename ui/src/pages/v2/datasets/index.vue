<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3 max-w-7xl mx-auto">
      <!-- Header -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-5">
              <div class="flex-1">
                <Searchbar
                  v-model="searchTerm"
                  placeholder="Search datasets…"
                />
              </div>
            </div>

            <!-- Filters -->
            <div class="flex items-center gap-5 flex-wrap">
              <ModernButtonToggle
                v-model="activeScope"
                label="Access via"
                :options="scopeFilters"
                text-by="label"
                value-by="value"
                color="blue"
                size="sm"
              />

              <ModernButtonToggle
                v-model="activeStatus"
                label="Status"
                :options="statusFilters"
                text-by="label"
                value-by="value"
                color="blue"
                size="sm"
              />

              <ModernButtonToggle
                v-model="activeType"
                label="Type"
                :options="typeFilters"
                text-by="label"
                value-by="value"
                color="blue"
                size="sm"
              />
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Results -->
      <VaCard class="min-h-[360px]">
        <VaCardContent>
          <Transition name="fade-slide" mode="out-in">
            <div v-if="error" class="py-12 px-6">
              <ErrorState
                title="Failed to load datasets"
                :message="error?.message"
                @retry="fetchDatasets"
              />
            </div>

            <div v-else-if="datasets.length > 0">
              <VaDataTable
                :items="datasets"
                :columns="columns"
                class="datasets-table"
                v-model:sort-by="sortBy"
                v-model:sorting-order="sortOrder"
                disable-client-side-sorting
              >
                <template #cell(name)="{ row }">
                  <RouterLink
                    :to="`/v2/datasets/${row.rowData.resource_id}`"
                    class="text-sm font-medium hover:underline"
                    style="color: var(--va-primary)"
                  >
                    {{ row.rowData.name }}
                  </RouterLink>
                </template>

                <template #cell(type)="{ value }">
                  <ModernChip size="small" outline>{{ value }}</ModernChip>
                </template>

                <template #cell(owner_group)="{ rowData }">
                  <RouterLink
                    v-if="rowData.owner_group"
                    :to="`/v2/groups/${rowData.owner_group.id}`"
                    class="text-sm hover:underline va-text-secondary"
                  >
                    {{ rowData.owner_group.name }}
                  </RouterLink>
                </template>

                <template #cell(size)="{ value }">
                  <span class="text-sm">{{ formatBytes(value) }}</span>
                </template>

                <template #cell(updated_at)="{ value }">
                  <span class="text-sm va-text-secondary">{{
                    datetime.fromNowShort(value)
                  }}</span>
                </template>

                <template #cell(status)="{ rowData }">
                  <ModernChip
                    :color="rowData.is_deleted ? 'secondary' : 'success'"
                    size="small"
                    outline
                  >
                    {{ rowData.is_deleted ? "Archived" : "Active" }}
                  </ModernChip>
                </template>
              </VaDataTable>

              <Pagination
                class="mt-5 px-5"
                v-model:page="currentPage"
                v-model:page_size="itemsPerPage"
                :total_results="total"
                :curr_items="datasets.length"
                :page_size_options="ITEMS_PER_PAGE_OPTIONS"
              />
            </div>

            <div v-else-if="!loading && areFiltersActive" class="py-12 px-6">
              <EmptyState
                title="No results found"
                message="Try adjusting your filters."
                @reset="resetFilters"
              />
            </div>

            <div
              v-else-if="!loading && !areFiltersActive"
              class="flex flex-col items-center justify-center gap-8 py-12 px-6"
            >
              <div class="flex items-center justify-center">
                <i-mdi-database-off
                  class="text-5xl text-gray-400 dark:text-gray-500"
                />
              </div>
              <div
                class="text-center max-w-md space-y-3 text-gray-900 dark:text-gray-100"
              >
                <h3 class="font-semibold tracking-tight">
                  No datasets available
                </h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  No datasets are currently available to you. Contact your group
                  administrator for access.
                </p>
              </div>
            </div>
          </Transition>
        </VaCardContent>
      </VaCard>
    </div>
  </VaInnerLoading>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import DatasetService from "@/services/v2/datasets";

const datasets = ref([]);
const error = ref(null);
const loading = ref(true);

const searchTerm = ref("");
const activeScope = ref("all");
const activeStatus = ref("all");
const activeType = ref("all");

const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref("updated_at");
const sortOrder = ref("desc");

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

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

const typeFilters = [
  { label: "All", value: "all" },
  { label: "Raw Data", value: "RAW_DATA" },
  { label: "Data Product", value: "DATA_PRODUCT" },
];

const columns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", width: "120px", sortable: true },
  { key: "owner_group", label: "Owner", width: "200px" },
  { key: "size", label: "Size", width: "100px", sortable: true },
  { key: "updated_at", label: "Last Updated", width: "120px", sortable: true },
  { key: "status", label: "Status", width: "100px" },
];

const areFiltersActive = computed(() => {
  return (
    searchTerm.value !== "" ||
    activeStatus.value !== "all" ||
    activeScope.value !== "all" ||
    activeType.value !== "all"
  );
});

watch(
  [
    activeScope,
    activeStatus,
    activeType,
    itemsPerPage,
    searchTerm,
    sortBy,
    sortOrder,
  ],
  () => {
    if (currentPage.value !== 1) {
      currentPage.value = 1;
      return;
    }
    fetchDatasets();
  },
);

watch(currentPage, fetchDatasets);

async function fetchDatasets() {
  loading.value = true;
  try {
    const { data } = await DatasetService.search({
      is_archived:
        activeStatus.value === "active"
          ? false
          : activeStatus.value === "archived"
            ? true
            : undefined,
      scope: activeScope.value !== "all" ? activeScope.value : undefined,
      type: activeType.value !== "all" ? activeType.value : undefined,
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
      name: searchTerm.value || undefined,
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
    });
    error.value = null;
    datasets.value = data.data;
    total.value = data.metadata?.total ?? data.data.length;
  } catch (err) {
    error.value = err;
    datasets.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  searchTerm.value = "";
  activeScope.value = "all";
  activeStatus.value = "all";
  activeType.value = "all";
}

onMounted(() => {
  fetchDatasets();
});
</script>

<route lang="yaml">
meta:
  title: Datasets
  nav: [{ label: "Datasets" }]
</route>

<style scoped>
.datasets-table {
  --va-data-table-cell-padding: 8px;
}
</style>
