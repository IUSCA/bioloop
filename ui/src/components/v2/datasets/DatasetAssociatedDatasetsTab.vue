<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3 max-w-5xl mx-auto">
      <!-- Header row -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- Search input -->
            <div class="flex-1">
              <Searchbar v-model="searchTerm" placeholder="Search datasets…" />
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Main content card -->
      <VaCard class="min-h-[360px]">
        <VaCardContent>
          <Transition name="fade-slide" mode="out-in">
            <!-- Not permitted to list -->
            <div
              v-if="!props.canList"
              class="flex flex-col items-center justify-center gap-6 py-12 px-6"
            >
              <div class="text-center max-w-md space-y-3">
                <h3 class="font-semibold tracking-tight">Access Restricted</h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  You don't have permission to view
                  {{ props.type === "source" ? "source" : "derived" }}
                  datasets. Request access to view this information.
                </p>
              </div>
              <VaButton preset="primary" @click="handleRequestAccess">
                <div class="flex items-center gap-2 mx-1">
                  <i-mdi-hand-okay class="text-sm" />
                  Request Access
                </div>
              </VaButton>
            </div>

            <!-- Error state -->
            <div v-else-if="error" class="py-12 px-6">
              <ErrorState
                title="Failed to load datasets"
                :message="error?.message"
                @retry="fetchDatasets"
              />
            </div>

            <!-- Datasets found -->
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
                    :to="`/v2/datasets/${row.rowData.id}`"
                    class="text-sm font-medium hover:underline"
                    style="color: var(--va-primary)"
                  >
                    {{ row.rowData.name }}
                  </RouterLink>
                </template>

                <template #cell(type)="{ row }">
                  <ModernChip
                    v-if="row.rowData.type"
                    color="secondary"
                    size="small"
                  >
                    {{ row.rowData.type }}
                  </ModernChip>
                  <span v-else class="text-sm va-text-secondary">—</span>
                </template>

                <template #cell(description)="{ value }">
                  <span class="text-sm va-text-secondary line-clamp-1">
                    {{ value || "—" }}
                  </span>
                </template>

                <template #cell(size)="{ value }">
                  <span class="text-sm">
                    {{ value ? formatBytes(value) : "—" }}
                  </span>
                </template>

                <template #cell(created_at)="{ value }">
                  <span class="text-sm">
                    {{ datetime.date(value) }}
                  </span>
                </template>

                <template #cell(updated_at)="{ value }">
                  <span class="text-sm">
                    {{ datetime.date(value) }}
                  </span>
                </template>

                <template #cell(status)="{ rowData }">
                  <ModernChip
                    :color="rowData.is_deleted ? 'secondary' : 'success'"
                    size="small"
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

            <!-- No results due to filters -->
            <div v-else-if="!loading && areFiltersActive" class="py-12 px-6">
              <EmptyState
                title="No results found"
                message="Try adjusting your filters."
                @reset="resetFilters"
              />
            </div>

            <!-- No data available -->
            <div
              v-else-if="!loading && !areFiltersActive"
              class="flex flex-col items-center justify-center gap-8 py-12 px-6"
            >
              <!-- Icon -->
              <div class="flex items-center justify-center">
                <Icon
                  :icon="getIcon('dataset')"
                  class="text-5xl text-gray-400 dark:text-gray-500"
                />
              </div>

              <!-- Content -->
              <div
                class="text-center max-w-md space-y-3 text-gray-900 dark:text-gray-100"
              >
                <h3 class="font-semibold tracking-tight">
                  No
                  {{ props.type === "source" ? "source" : "derived" }}
                  datasets
                </h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  <template v-if="props.type === 'source'">
                    This dataset was not derived from any other datasets.
                  </template>
                  <template v-else>
                    No datasets have been derived from this dataset yet.
                  </template>
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
import { getIcon } from "@/services/v2/icons";

const props = defineProps({
  type: { type: String, required: true }, // "source" or "derived"
  dataset: { type: Object, required: true },
  canList: { type: Boolean, default: false },
});

const datasets = ref([]);
const error = ref(null);
const loading = ref(true);
const searchTerm = ref("");
const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref("created_at");
const sortOrder = ref("desc");
const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

const areFiltersActive = computed(() => {
  return searchTerm.value !== "";
});

const columns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", width: "120px" },
  { key: "description", label: "Description" },
  { key: "size", label: "Size", width: "100px", sortable: true },
  { key: "created_at", label: "Created On", width: "120px", sortable: true },
  {
    key: "updated_at",
    label: "Last Updated",
    width: "120px",
    sortable: true,
  },
  { key: "status", label: "Status", width: "100px" },
];

watch([itemsPerPage, searchTerm, sortBy, sortOrder], () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchDatasets();
});

watch(currentPage, fetchDatasets);

async function fetchDatasets() {
  if (!props.canList) {
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const method =
      props.type === "source"
        ? DatasetService.getSourceDatasets
        : DatasetService.getDerivedDatasets;

    const { data } = await method(props.dataset.resource_id, {
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
    });

    console.log(`Fetched ${props.type} datasets:`, data.data);
    error.value = null;
    datasets.value = data.data;
    total.value = data.metadata?.total ?? data.data.length;
  } catch (err) {
    error.value =
      err?.response?.data?.message ??
      `An error occurred while fetching ${props.type} datasets.`;
    datasets.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  searchTerm.value = "";
}

function handleRequestAccess() {
  // TODO: Implement request access flow
  console.log("Request access for", props.type, "datasets");
}

onMounted(() => {
  fetchDatasets();
});
</script>

<style scoped>
.datasets-table {
  --va-data-table-cell-padding: 8px;
}
.card.header {
  --va-card-padding: 0.8rem;
}
</style>
