<template>
  <VaInnerLoading :loading="loading" icon="flare">
    <div class="flex flex-col gap-3">
      <!-- Header row -->
      <VaCard class="header card">
        <VaCardContent>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- Search input -->
            <div class="flex-1">
              <Searchbar
                v-model="searchTerm"
                placeholder="Search collections…"
              />
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
              @click="navigateToCreateCollection"
              v-if="props.canCreate"
            >
              <div class="flex items-center justify-between gap-2 mx-1">
                <i-mdi-plus class="text-sm" />
                Create Collection
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
                title="Failed to load collections"
                :error="error"
                subject="these collections"
                @retry="fetchCollections"
              />
            </div>

            <!-- results -->
            <div v-else-if="collections.length > 0">
              <VaDataTable
                :items="collections"
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
                    :to="`/v2/collections/${row.rowData.id}`"
                    class="text-sm font-medium hover:underline"
                    style="color: var(--va-primary)"
                  >
                    {{ row.rowData.name }}
                  </RouterLink>
                </template>

                <template #cell(tagline)="{ value }">
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
                  <span class="text-sm">
                    {{ datetime.date(value) }}
                  </span>
                </template>

                <template #cell(status)="{ rowData }">
                  <Badge :color="rowData.is_archived ? 'neutral' : 'success'">
                    {{ rowData.is_archived ? "Archived" : "Active" }}
                  </Badge>
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
            <div v-else-if="!loading && !areFiltersActive" class="py-12 px-6">
              <EmptyState
                icon="mdi-folder-multiple"
                title="No collections available"
                :show-clear-filters="false"
              >
                <template #message>
                  <template v-if="props.canCreate">
                    This group has no collections yet. Add the first collection
                    to get started.
                  </template>
                  <template v-else>
                    No collections are currently available to you in this group.
                    This group may have no collections, or you may not have been
                    granted access. Contact your group administrator for
                    assistance.
                  </template>
                </template>
                <template v-if="props.canCreate" #actions>
                  <VaButton @click="navigateToCreateCollection">
                    <div class="flex items-center gap-3 px-2">
                      <i-mdi-plus class="text-lg" />
                      <span class="font-medium">Create Collection</span>
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
  <CollectionCreateModal
    v-if="props.canCreate"
    :group="props.group"
    @update="handleNewCollection"
    ref="collectionCreateModal"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import CollectionService from "@/services/v2/collections";
import { VaCardContent } from "vuestic-ui/web-components";

const props = defineProps({
  group: { type: Object, required: true },
  canCreate: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const collections = ref([]);
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

const number_formatter = Intl.NumberFormat("en");

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
  { key: "tagline", label: "Tagline", tdClass: "v2-table-fill-cell" },
  { key: "size", label: "Size", sortable: true },
  { key: "created_at", label: "Created On", sortable: true },
  { key: "updated_at", label: "Last Updated", sortable: true },
  { key: "status", label: "Status" },
];

function setStatus(value) {
  activeStatus.value = value;
}

watch([itemsPerPage, searchTerm, activeStatus, sortBy, sortOrder], () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchCollections();
});

watch(currentPage, fetchCollections);

async function fetchCollections() {
  loading.value = true;
  try {
    const { data } = await CollectionService.search({
      owner_group_id: props.group.id,
      is_archived:
        activeStatus.value === "active"
          ? false
          : activeStatus.value === "archived"
            ? true
            : undefined,
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

function handleNewCollection() {
  emit("count-changed");
}

function resetFilters() {
  searchTerm.value = "";
  setStatus("all");
}

onMounted(() => {
  fetchCollections();
});

const collectionCreateModal = ref(null);
function navigateToCreateCollection() {
  collectionCreateModal.value?.show();
}

defineExpose({
  navigateToCreateCollection,
});
</script>
