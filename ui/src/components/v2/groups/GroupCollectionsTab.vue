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
                placeholder="Search collections…"
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

                <template #cell(description)="{ value }">
                  <span class="text-sm va-text-secondary line-clamp-1">
                    {{ value || "—" }}
                  </span>
                </template>

                <template #cell(size)="{ value }">
                  <span class="text-sm">
                    {{ value != null ? number_formatter.format(value) : "—" }}
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
                </p>
              </div>

              <VaButton
                v-if="props.canCreate"
                @click="navigateToCreateCollection"
              >
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
</template>

<script setup>
import * as datetime from "@/services/datetime";
import CollectionService from "@/services/v2/collections";
import { VaCardContent } from "vuestic-ui/web-components";

const props = defineProps({
  groupId: { type: String, required: true },
  canCreate: { type: Boolean, default: false },
});

// const emit = defineEmits(["count-changed"]);

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
  { key: "description", label: "Description" },
  { key: "size", label: "Size", width: "80px", sortable: true },
  { key: "created_at", label: "Created On", width: "120px", sortable: true },
  { key: "updated_at", label: "Last Updated", width: "120px", sortable: true },
  { key: "status", label: "Status", width: "100px" },
];

const debouncedFetch = useDebounceFn(() => {
  if (currentPage.value === 1) {
    fetchCollections();
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
  fetchCollections();
}

watch([itemsPerPage, sortBy, sortOrder], () => {
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
      owner_group_id: props.groupId,
      is_archived:
        activeStatus.value === "active"
          ? false
          : activeStatus.value === "archived"
            ? true
            : undefined,
      limit: itemsPerPage.value,
      offset: (currentPage.value - 1) * itemsPerPage.value,
      search_term: searchTerm.value || undefined,
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
    });
    error.value = null;
    collections.value = data.data;

    // Filter by status if needed (client-side for now)
    // if (activeStatus.value !== "all") {
    //   collections.value = collections.value.filter((c) => {
    //     if (activeStatus.value === "active") {
    //       return !c.is_archived;
    //     } else if (activeStatus.value === "archived") {
    //       return c.is_archived;
    //     }
    //     return true;
    //   });
    // }

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
  setStatus("all");
}

function navigateToCreateCollection() {
  // TODO: Route to create collection page or open modal
  // For now, this placeholder can be connected to your navigation/modal logic
}

onMounted(() => {
  fetchCollections();
});
</script>

<style scoped>
.collections-table {
  --va-data-table-cell-padding: 8px;
}
.card.header {
  --va-card-padding: 0.8rem;
}
</style>
