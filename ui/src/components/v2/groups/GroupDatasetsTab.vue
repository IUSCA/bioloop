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

            <ModernButtonToggle
              :model-value="activeStatus"
              label="Status"
              :options="statusFilters"
              text-by="label"
              value-by="value"
              color="primary"
              size="sm"
              @update:model-value="setStatus"
            />

            <VaButton
              size="small"
              :disabled="!stateAdmits('add_dataset')"
              :title="stateAdmits('add_dataset') ? null : DISABLED_REASON"
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
                hoverable
                striped
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

            <!-- no results -->
            <div v-else-if="!loading && areFiltersActive" class="py-12 px-6">
              <EmptyState
                title="No results found"
                message="Try adjusting your filters."
                @reset="resetFilters"
              />
            </div>

            <!-- no data -->
            <div v-else-if="!loading && !areFiltersActive" class="py-12 px-6">
              <EmptyState
                icon="mdi-database-outline"
                title="No datasets available"
                :show-clear-filters="false"
              >
                <template #message>
                  <template v-if="props.canCreate">
                    This group has no datasets yet. Add the first dataset to get
                    started.
                  </template>
                  <template v-else>
                    No datasets are currently available to you in this group.
                    This group may have no datasets, or you may not have been
                    given access. Contact your group administrator for
                    assistance.
                  </template>
                </template>
                <template #actions>
                  <!-- Call to action -->
                  <VaButton
                    v-if="props.canCreate"
                    :disabled="!stateAdmits('add_dataset')"
                    :title="stateAdmits('add_dataset') ? null : DISABLED_REASON"
                    @click="navigateToCreateDataset"
                  >
                    <div class="flex items-center gap-3 px-2">
                      <i-mdi-plus class="text-lg" />
                      <span class="font-medium">Add Dataset</span>
                    </div>
                  </VaButton>
                </template>
              </EmptyState>
            </div>
          </Transition>
        </VaCardContent>
      </VaCard>
    </div>
  </VaInnerLoading>

  <!--
    The owning group is fixed here: the user is on that group's page, so there is nothing to
    choose. The modal still shows which group it will be.
    @see docs/design/groups/implementation/dataset-creation-plan.md — A7
  -->
  <AddDatasetModal
    ref="addDatasetModal"
    :group="props.group"
    @created="onDatasetCreated"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import AddDatasetModal from "@/components/v2/datasets/create/AddDatasetModal.vue";
import DatasetService from "@/services/v2/datasets";
import { VaCardContent } from "vuestic-ui/web-components";

const props = defineProps({
  groupId: { type: String, required: true },
  group: { type: Object, required: false, default: null },
  canCreate: { type: Boolean, required: true },
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

// const emit = defineEmits(["count-changed"]);

const addDatasetModal = ref(null);
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
  { key: "type", label: "Type" },
  { key: "description", label: "Description", tdClass: "v2-table-fill-cell" },
  { key: "size", label: "Size", sortable: true },
  { key: "created_at", label: "Created On", sortable: true },
  { key: "updated_at", label: "Last Updated", sortable: true },
  { key: "status", label: "Status" },
];

function setStatus(value) {
  activeStatus.value = value;
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchDatasets();
}

watch([itemsPerPage, searchTerm, sortBy, sortOrder], () => {
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
      owner_group_id: props.groupId,
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
  } catch (err) {
    error.value = err;
    datasets.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function navigateToCreateDataset() {
  addDatasetModal.value?.show();
}

function onDatasetCreated() {
  // An import lands immediately; an upload has only been registered at this point, and its
  // transfer is reported by the tray. Refetching covers both.
  fetchDatasets();
}

function resetFilters() {
  searchTerm.value = "";
  setStatus("all");
}

onMounted(() => {
  fetchDatasets();
});
</script>
