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

            <!-- Authorization is per dataset, so this reports what was staged, what was
                 refused, and what needed nothing, rather than failing the batch. -->
            <VaButton
              v-if="canStage"
              size="small"
              preset="secondary"
              :loading="staging"
              @click="stageSelected"
            >
              <div class="flex items-center justify-between gap-2 mx-1">
                <i-mdi-cloud-download class="text-sm" />
                {{ selected.length ? `Stage ${selected.length}` : "Stage all" }}
              </div>
            </VaButton>

            <VaButton
              size="small"
              :disabled="!stateAdmits('add_dataset')"
              :title="stateAdmits('add_dataset') ? null : DISABLED_REASON"
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
                :error="error"
                subject="these datasets"
                @retry="fetchDatasets"
              />
            </div>

            <div v-else-if="datasets.length > 0">
              <!-- A grant to browse a collection does not open every dataset in it. Offer the
                   next step rather than links that end in a refusal. -->
              <ModernAlert
                v-if="hasRowsThatWillNotOpen"
                color="info"
                class="mb-4"
                title="Some datasets here are not open to you"
              >
                <div
                  class="flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <span>
                    You can see that they belong to this collection, but not
                    their details. Request access to this collection to open
                    them.
                  </span>
                  <VaButton size="small" @click="emit('request-access')">
                    Request access
                  </VaButton>
                </div>
              </ModernAlert>

              <VaDataTable
                :items="datasets"
                :columns="columns"
                class="v2-table"
                v-model:sort-by="sortBy"
                v-model:sorting-order="sortOrder"
                v-model="selected"
                :selectable="canStage"
                select-mode="multiple"
                disable-client-side-sorting
              >
                <template #cell(name)="{ row }">
                  <RouterLink
                    v-if="
                      row.rowData._meta?.capabilities?.includes('view_metadata')
                    "
                    :to="`/v2/datasets/${row.rowData.resource_id}`"
                    class="text-sm font-medium hover:underline"
                    style="color: var(--va-primary)"
                  >
                    {{ row.rowData.name }}
                  </RouterLink>
                  <span v-else class="text-sm font-medium">
                    {{ row.rowData.name }}
                  </span>
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

                <template #cell(size)="{ rowData }">
                  <span class="text-sm">
                    {{
                      rowData?.size != null ? formatBytes(rowData.size) : "—"
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
                  <Badge :color="rowData.is_deleted ? 'neutral' : 'success'">
                    {{ rowData.is_deleted ? "Archived" : "Active" }}
                  </Badge>
                </template>

                <template #cell(actions)="{ rowData }">
                  <VaButtonDropdown preset="primary" class="" size="small">
                    <div class="flex flex-col items-start gap-2">
                      <VaButton
                        v-if="props.canRemove"
                        :disabled="!stateAdmits('remove_dataset')"
                        :title="
                          stateAdmits('remove_dataset') ? null : DISABLED_REASON
                        "
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
            <div v-else-if="!loading && !areFiltersActive" class="py-12 px-6">
              <EmptyState
                :icon="getIcon('dataset')"
                title="No datasets available"
                :show-clear-filters="false"
              >
                <template #message>
                  <template v-if="props.canCreate">
                    This collection has no datasets yet. Add the first dataset
                    to get started.
                  </template>
                  <template v-else>
                    No datasets are currently available to you in this
                    collection. This collection may have no datasets, or you may
                    not have been given access. Contact the administrator for
                    assistance.
                  </template>
                </template>
                <template #actions>
                  <!-- Call to action -->
                  <VaButton
                    v-if="props.canCreate"
                    :disabled="!stateAdmits('add_dataset')"
                    :title="stateAdmits('add_dataset') ? null : DISABLED_REASON"
                    @click="openAddDatasetModal"
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
import { holds } from "@/composables/useCapabilities";
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import CollectionService from "@/services/v2/collections";
import toast from "@/services/toast";
import { getIcon } from "@/services/v2/icons";

const props = defineProps({
  collection: { type: Object, required: true },
  canCreate: { type: Boolean, required: true },
  canRemove: { type: Boolean, required: true },
  /**
   * `_meta.available_actions`: what the collection's own state admits right now, or null when the
   * response did not say. A control the state withholds stays visible and disabled, because
   * the caller keeps the authority and will hold it again.
   *
   * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
   */
  availableActions: { type: Array, default: null },
});

/**
 * Whether the collection's state admits the action.
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
const DISABLED_REASON = "This collection is archived.";

const emit = defineEmits(["count-changed", "request-access"]);

const datasets = ref([]);
const selected = ref([]);
const staging = ref(false);
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

// Staging is authorized per dataset, so offer it only when some row on this page accepts it.
// The stage route still checks every dataset it is asked to stage.
const canStage = computed(() =>
  datasets.value.some((d) => holds(d, "request_stage")),
);

const hasRowsThatWillNotOpen = computed(() =>
  datasets.value.some((d) => !holds(d, "view_metadata")),
);

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
  if (props.canRemove) {
    _columns.push({ key: "actions", label: "" });
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
    const { data } = await CollectionService.getDatasets(props.collection.id, {
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
async function stageSelected() {
  staging.value = true;
  try {
    const { data } = await CollectionService.stageDatasets(
      props.collection.id,
      {
        dataset_resource_ids: selected.value.length
          ? selected.value.map((d) => d.resource_id)
          : undefined,
      },
    );

    // Say what happened to each group rather than claiming a flat success. Refused and
    // skipped datasets are the common case, not an error.
    const parts = [];
    if (data.staged.length) parts.push(`${data.staged.length} staging`);
    if (data.skipped.length) {
      parts.push(`${data.skipped.length} already staged or in progress`);
    }
    if (data.denied.length) parts.push(`${data.denied.length} not permitted`);

    const summary = parts.join(", ") || "Nothing to stage";
    if (data.staged.length) toast.success(summary);
    else toast.info(summary);

    selected.value = [];
  } catch (err) {
    console.error(err);
    toast.error(err?.response?.data?.message || "Unable to stage datasets");
  } finally {
    staging.value = false;
  }
}
</script>

<style scoped>
:deep(.va-dropdown__content) {
  --va-dropdown-content-padding: 0px;
}
</style>
