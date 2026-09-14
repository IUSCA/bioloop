<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3">
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
            <div v-if="!props.canList" class="py-12 px-6">
              <EmptyState
                icon="mdi-lock-outline"
                title="Access Restricted"
                message="You don't have permission to view {{ props.type === 'source' ? 'source' : 'derived' }} datasets. Request access to view this information."
              >
                <template #actions>
                  <VaButton preset="primary" @click="handleRequestAccess">
                    <div class="flex items-center gap-2 mx-1">
                      <i-mdi-hand-okay class="text-sm" />
                      Request Access
                    </div>
                  </VaButton>
                </template>
              </EmptyState>
            </div>

            <!-- Error state -->
            <div v-else-if="error" class="py-12 px-6">
              <ErrorState
                title="Failed to load datasets"
                :error="error"
                subject="these datasets"
                @retry="fetchDatasets"
              />
            </div>

            <!-- Datasets found -->
            <div v-else-if="datasets.length > 0">
              <VaDataTable
                :items="datasets"
                :columns="columns"
                class="v2-table"
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
                  <Badge v-if="row.rowData.type" color="neutral">
                    {{ row.rowData.type }}
                  </Badge>
                  <span v-else class="text-sm va-text-secondary">—</span>
                </template>

                <template #cell(description)="{ value }">
                  <span
                    class="block truncate text-sm va-text-secondary"
                    :title="value"
                  >
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
                  <Badge :color="rowData.is_deleted ? 'neutral' : 'success'">
                    {{ rowData.is_deleted ? "Archived" : "Active" }}
                  </Badge>
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
            <div v-else-if="!loading && !areFiltersActive" class="py-12 px-6">
              <EmptyState
                :icon="getIcon('dataset')"
                :title="`No ${props.type === 'source' ? 'source' : 'derived'} datasets`"
                :show-clear-filters="false"
              >
                <template #message>
                  <template v-if="props.type === 'source'">
                    This dataset was not derived from any other datasets.
                  </template>
                  <template v-else>
                    No datasets have been derived from this dataset yet.
                  </template>
                </template>
              </EmptyState>
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
  { key: "type", label: "Type" },
  { key: "description", label: "Description", tdClass: "v2-table-fill-cell" },
  { key: "size", label: "Size", sortable: true },
  { key: "created_at", label: "Created On", sortable: true },
  {
    key: "updated_at",
    label: "Last Updated",
    sortable: true,
  },
  { key: "status", label: "Status" },
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
    error.value = err;
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
