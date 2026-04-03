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
              @click="openAddDatasetModal"
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

                <template #cell(size)="{ rowData }">
                  <span class="text-sm">
                    {{
                      rowData?._count?.datasets != null
                        ? formatBytes(rowData._count.datasets)
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

                <template #cell(actions)="{ rowData }">
                  <VaButtonDropdown preset="primary" class="" size="small">
                    <div class="flex flex-col items-start gap-2">
                      <VaButton
                        v-if="props.canRemove"
                        @click="openRemoveDatasetModal(rowData)"
                        size="small"
                        preset="secondary"
                        color="danger"
                        class="w-full"
                      >
                        <div class="flex items-center gap-1">
                          <i-mdi-close class="text-sm" />
                          Remove
                        </div>
                      </VaButton>
                    </div>
                  </VaButtonDropdown>
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
                    not have been granted access. Contact the administrator for
                    assistance.
                  </template>
                </p>
              </div>

              <!-- Call to action -->
              <VaButton v-if="props.canCreate" @click="openAddDatasetModal">
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
  <CollectionAddDatasetModal
    ref="addDatasetModal"
    :collection-id="props.collection.id"
    :owner-group-id="props.collection.owner_group_id"
    @update="handleDatasetUpdated"
  />
  <CollectionRemoveDatasetModal
    ref="removeDatasetModal"
    :collection="props.collection"
    @update="handleDatasetUpdated"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import DatasetService from "@/services/v2/datasets";
import { getIcon } from "@/services/v2/icons";

const props = defineProps({
  collection: { type: Object, required: true },
  canCreate: { type: Boolean, required: true },
  canRemove: { type: Boolean, required: true },
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

const columns = computed(() => {
  const _columns = [
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
  if (props.canRemove) {
    _columns.push({ key: "actions", label: "", width: "40px" });
  }
  return _columns;
});

function setStatus(value) {
  activeStatus.value = value;
}

watch([itemsPerPage, searchTerm, activeStatus, sortBy, sortOrder], () => {
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
      collection_id: props.collection.id,
      sort_by: sortBy.value === "size" ? "_count.datasets" : sortBy.value,
      sort_order: sortOrder.value,
    });

    console.log("Fetched datasets:", data.data);
    error.value = null;
    datasets.value = data.data;
    total.value = data.metadata?.total ?? data.data.length;
  } catch (err) {
    error.value =
      err?.response?.data?.message ??
      "An error occurred while fetching datasets.";
    datasets.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  searchTerm.value = "";
  setStatus("all");
}

function handleDatasetUpdated() {
  fetchDatasets();
  emit("count-changed");
}

const removeDatasetModal = ref(null);
function openRemoveDatasetModal(dataset) {
  removeDatasetModal.value.show(dataset);
}

onMounted(() => {
  fetchDatasets();
});

const addDatasetModal = ref(null);
function openAddDatasetModal() {
  if (addDatasetModal.value) {
    addDatasetModal.value.show();
  }
}

defineExpose({
  openAddDatasetModal,
});
</script>

<style scoped>
.datasets-table {
  --va-data-table-cell-padding: 8px;
}
.card.header {
  --va-card-padding: 0.8rem;
}
:deep(.va-dropdown__content) {
  --va-dropdown-content-padding: 0px;
}
</style>
