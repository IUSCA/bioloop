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
                placeholder="Search datasets…"
                outline
                clearable
                @update:model-value="debouncedFetch"
              >
                <template #prependInner>
                  <Icon icon="material-symbols:search" class="text-xl" />
                </template>
              </va-input>
            </div>

            <!-- Status filter chips -->
            <div class="flex items-center gap-2">
              <VaChip
                v-for="f in statusFilters"
                :key="f.value"
                :color="activeStatus === f.value ? 'primary' : 'secondary'"
                class="cursor-pointer"
                size="small"
                :outline="activeStatus !== f.value"
                @click="setStatus(f.value)"
              >
                {{ f.label }}
              </VaChip>
            </div>

            <VaButton
              size="small"
              @click="navigateToCreateDataset"
              v-if="props.canCreate"
            >
              <div class="flex items-center justify-between gap-2 mx-1">
                <i-mdi-plus class="text-sm" />
                New Dataset
              </div>
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- keeps layout stable when swapping views -->
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
                hoverable
                striped
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
                    {{ value != null ? formatBytes(value) : "—" }}
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

            <!-- no results -->
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
              class="flex flex-col items-center justify-center gap-8 py-12 px-6"
            >
              <!-- Icon -->
              <div class="flex items-center justify-center">
                <i-mdi-database-outline
                  class="text-5xl text-gray-400 dark:text-gray-500"
                />
              </div>

              <!-- Content -->
              <div
                class="text-center max-w-md space-y-3 text-gray-900 dark:text-gray-100"
              >
                <h3 class="font-semibold tracking-tight">
                  No datasets available
                </h3>
                <p class="text-sm leading-relaxed va-text-secondary">
                  <template v-if="props.canCreate">
                    This collection has no datasets yet. Add the first dataset
                    to get started.
                  </template>
                  <template v-else>
                    No datasets are currently available to you in this
                    collection. This collection may have no datasets, or you may
                    not have been granted access. Contact your collection
                    administrator for assistance.
                  </template>
                </p>
              </div>

              <!-- Call to action -->
              <VaButton v-if="props.canCreate" @click="navigateToCreateDataset">
                <div class="flex items-center gap-3 px-2">
                  <i-mdi-plus class="text-lg" />
                  <span class="font-medium">Add Dataset</span>
                </div>
              </VaButton>
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
import { VaCardContent } from "vuestic-ui/web-components";

const props = defineProps({
  collectionId: { type: String, required: true },
  canCreate: { type: Boolean, required: true },
});

const emit = defineEmits(["count-changed"]);

const datasets = ref([]);
const error = ref(null);
const loading = ref(true);
const activeStatus = ref("all"); // 'all' | 'active' | 'archived'
const searchTerm = ref("");
const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref("created_at");
const sortOrder = ref("desc");
const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

const areFiltersActive = computed(() => {
  return searchTerm.value !== "" || activeStatus.value !== "all";
});

const statusFilters = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

const columns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", width: "120px" },
  { key: "description", label: "Description" },
  { key: "size", label: "Size", width: "100px", sortable: true },
  { key: "created_at", label: "Created On", width: "120px", sortable: true },
  { key: "updated_at", label: "Last Updated", width: "120px", sortable: true },
  { key: "status", label: "Status", width: "100px" },
];

const debouncedFetch = useDebounceFn(() => {
  if (currentPage.value === 1) {
    fetchDatasets();
    return;
  }
  currentPage.value = 1;
}, 350);

function setStatus(value) {
  activeStatus.value = value;
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchDatasets();
}

watch([itemsPerPage, sortBy, sortOrder], () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchDatasets();
});

watch(currentPage, fetchDatasets);

async function fetchDatasets() {
  loading.value = true;
  try {
    const { data } = await DatasetService.search({
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
      name: searchTerm.value || undefined,
      collection_id: props.collectionId,
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
    });

    error.value = null;
    datasets.value = data.data;

    // Filter by status if needed (client-side for now)
    if (activeStatus.value !== "all") {
      datasets.value = datasets.value.filter((d) => {
        if (activeStatus.value === "active") {
          return !d.is_deleted;
        } else if (activeStatus.value === "archived") {
          return d.is_deleted;
        }
        return true;
      });
    }

    total.value = data.metadata?.total ?? data.data.length;
    emit("count-changed", total.value);
  } catch (err) {
    error.value = err;
    datasets.value = [];
    total.value = 0;
    emit("count-changed", 0);
  } finally {
    loading.value = false;
  }
}

function navigateToCreateDataset() {
  // TODO: Route to create dataset page or open modal
  // For now, this placeholder can be connected to your navigation/modal logic
}

function resetFilters() {
  searchTerm.value = "";
  setStatus("all");
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
