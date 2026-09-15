<template>
  <div data-testid="dataset-list" class="flex flex-col gap-3">
    <!-- Header -->
    <VaCard class="header card">
      <VaCardContent>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-5">
            <div class="flex-1">
              <Searchbar v-model="searchTerm" placeholder="Search datasets…" />
            </div>

            <!--
              The group is selectable here, unlike on a group's own page, because this list
              spans every group the user can reach.
              @see docs/design/groups/implementation/dataset-creation-plan.md — A7
            -->
            <VaButton v-if="canCreate" @click="openAddDataset">
              <div class="flex items-center justify-between gap-2 mx-1">
                <i-mdi-plus class="text-sm" />
                New Dataset
              </div>
            </VaButton>
          </div>

          <!-- Filters -->
          <div class="flex items-center gap-5 flex-wrap">
            <ModernButtonToggle
              v-model="activeScope"
              label="Access via"
              :options="scopeFilters"
              text-by="label"
              value-by="value"
              color="primary"
              size="sm"
            />

            <ModernButtonToggle
              v-model="activeStatus"
              label="Status"
              :options="statusFilters"
              text-by="label"
              value-by="value"
              color="primary"
              size="sm"
            />

            <ModernButtonToggle
              v-model="activeType"
              label="Type"
              :options="typeFilters"
              text-by="label"
              value-by="value"
              color="primary"
              size="sm"
            />

            <!--
              An upload that fails for good is tombstoned, so it drops out of the ordinary
              listing. Choosing anything but "All" here reaches those rows.
              @see docs/design/groups/implementation/dataset-creation-plan.md — C5
            -->
            <ModernButtonToggle
              v-model="activeUpload"
              label="Upload"
              :options="uploadFilters"
              text-by="label"
              value-by="value"
              color="primary"
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
          <div v-if="loading" class="flex flex-col gap-2 py-2">
            <VaSkeleton
              v-for="n in 8"
              :key="n"
              variant="rounded"
              height="40px"
            />
          </div>

          <div v-else-if="error" class="py-12 px-6">
            <ErrorState
              title="Failed to load datasets"
              :error="error"
              subject="these datasets"
              @retry="fetchDatasets"
            />
          </div>

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
                  :to="`/v2/datasets/${row.rowData.resource_id}`"
                  class="text-sm font-medium hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ row.rowData.name }}
                </RouterLink>
              </template>

              <template #cell(type)="{ value }">
                <Badge outline>{{ value }}</Badge>
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
                <!--
                  While the upload filter is on, the upload's own state is the answer the
                  reader came for. A tombstoned failed upload is a deleted dataset, and
                  labelling it only "Archived" would hide the failure it is there to show.
                -->
                <Badge
                  v-if="uploadStatusOf(rowData)"
                  :color="uploadBadgeColor(uploadStatusOf(rowData))"
                >
                  {{
                    uploadStatusOf(rowData).replaceAll("_", " ").toLowerCase()
                  }}
                </Badge>
                <Badge
                  v-else
                  :color="rowData.is_deleted ? 'neutral' : 'success'"
                >
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

          <div v-else-if="!loading && areFiltersActive" class="py-12 px-6">
            <EmptyState
              title="No results found"
              message="Try adjusting your filters."
              @reset="resetFilters"
            />
          </div>

          <div v-else-if="!loading && !areFiltersActive" class="py-12 px-6">
            <EmptyState
              icon="mdi-database-off"
              title="No datasets available"
              message="No datasets are currently available to you. Contact your group administrator for access."
            />
          </div>
        </Transition>
      </VaCardContent>
    </VaCard>
  </div>

  <AddDatasetModal ref="addDatasetModal" @created="fetchDatasets" />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import AddDatasetModal from "@/components/v2/datasets/create/AddDatasetModal.vue";
import DatasetService from "@/services/v2/datasets";

const addDatasetModal = ref(null);

// Offered when some group would accept a dataset from this user. The picker inside the modal
// lists those groups; this asks the same endpoint so the button is never a dead end.
const canCreate = ref(false);
onMounted(async () => {
  try {
    const { data } = await DatasetService.eligibleOwnerGroups();
    canCreate.value = (data ?? []).length > 0;
  } catch {
    canCreate.value = false;
  }
});

const datasets = ref([]);
const error = ref(null);
const loading = ref(true);

const searchTerm = ref("");
const activeScope = ref("all");
const activeStatus = ref("all");
const activeType = ref("all");
const activeUpload = ref("all");

const total = ref(0);
const currentPage = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref("updated_at");
const sortOrder = ref("desc");

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];

function openAddDataset() {
  addDatasetModal.value?.show();
}

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

// The three group names the API accepts in `upload_status`, plus the off position.
const uploadFilters = [
  { label: "All", value: "all" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Failed", value: "FAILED" },
  { label: "Complete", value: "COMPLETE" },
];

const FAILED_UPLOAD_STATUSES = [
  "UPLOAD_FAILED",
  "VERIFICATION_FAILED",
  "PROCESSING_FAILED",
  "PERMANENTLY_FAILED",
];

// The list carries at most one upload log per row, and only when the filter asked for it.
function uploadStatusOf(row) {
  return row.upload_logs?.[0]?.status ?? null;
}

function uploadBadgeColor(status) {
  if (FAILED_UPLOAD_STATUSES.includes(status)) return "danger";
  if (status === "COMPLETE") return "success";
  return "warning";
}

const columns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "owner_group", label: "Owner" },
  { key: "size", label: "Size", sortable: true },
  { key: "updated_at", label: "Last Updated", sortable: true },
  { key: "status", label: "Status" },
];

const areFiltersActive = computed(() => {
  return (
    searchTerm.value !== "" ||
    activeStatus.value !== "all" ||
    activeScope.value !== "all" ||
    activeType.value !== "all" ||
    activeUpload.value !== "all"
  );
});

watch(
  [
    activeScope,
    activeStatus,
    activeType,
    activeUpload,
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
      upload_status:
        activeUpload.value !== "all" ? activeUpload.value : undefined,
      include_upload_log: activeUpload.value !== "all" ? true : undefined,
      // The Owner column is always shown, so the join is always wanted.
      include_owner_group: true,
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
  activeUpload.value = "all";
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
