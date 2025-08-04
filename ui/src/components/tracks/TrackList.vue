<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1" v-if="activeFilters.length === 0">
        <va-input
          :model-value="params.inclusive_query"
          class="w-full"
          placeholder="Search tracks"
          outline
          clearable
          @update:model-value="handleMainFilter"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- Filter button -->
      <va-button @click="searchModal.show()" preset="primary" class="flex-none">
        <i-mdi-filter />
        <span> Filters </span>
      </va-button>

      <!-- active filter chips -->
      <TrackSearchFilters
        v-if="activeFilters.length > 0"
        class="flex-none"
        @search="handleSearch"
        @open="searchModal.show()"
      />
    </div>

    <!-- table -->
    <va-data-table
      :items="tracks"
      :columns="columns"
      v-model:sort-by="query.sort_by"
      v-model:sorting-order="query.sort_order"
      disable-client-side-sorting
      :loading="data_loading"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/tracks/${rowData.id}`" class="va-link">{{
          rowData.name
        }}</router-link>
      </template>

      <template #cell(file_type)="{ value }">
        <span class="font-mono text-sm">{{ value }}</span>
      </template>

      <template #cell(genome)="{ rowData }">
        <span>{{ rowData.genomeType }} {{ rowData.genomeValue }}</span>
      </template>

      <template #cell(dataset)="{ rowData }">
        <router-link 
          :to="`/datasets/${rowData.dataset_file?.dataset?.id}`" 
          class="va-link"
        >
          {{ rowData.dataset_file?.dataset?.name }}
        </router-link>
      </template>

      <template #cell(projects)="{ rowData }">
        <span v-if="rowData.projects?.length">
          {{ rowData.projects.map(p => p.project.name).join(', ') }}
        </span>
        <span v-else class="text-gray-500">None</span>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ datetime.date(value) }}</span>
      </template>

      <template #cell(updated_at)="{ value }">
        <span>{{ datetime.fromNow(value) }}</span>
      </template>

      <template #cell(actions)="{ rowData }">
        <div class="flex gap-1">
          <va-button
            class="flex-auto"
            preset="plain"
            icon="visibility"
            @click="viewTrack(rowData)"
          />
          <template v-if="auth.canOperate">
            <va-button
              class="flex-auto"
              preset="plain"
              icon="delete"
              color="danger"
              @click="deleteTrack(rowData.id)"
            />
          </template>
        </div>
      </template>
    </va-data-table>

    <!-- pagination -->
    <Pagination
      class="mt-4 px-1 lg:px-3"
      v-model:page="query.page"
      v-model:page_size="query.page_size"
      :total_results="total_results"
      :curr_items="tracks.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />

    <TrackSearchModal ref="searchModal" @search="handleSearch" />
  </div>
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import trackService from "@/services/track";
import { useAuthStore } from "@/stores/auth";
import { useTracksStore } from "@/stores/tracks";
import { storeToRefs } from "pinia";

useSearchKeyShortcut();

const store = useTracksStore();
const { filters, query, params, activeFilters } = storeToRefs(store);

const auth = useAuthStore();

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const tracks = ref([]);
const data_loading = ref(false);
const total_results = ref(0);
const searchModal = ref(null);

// used for OFFSET clause in the SQL used to retrieve the next paginated batch
// of results
const offset = computed(() => (query.value.page - 1) * query.value.page_size);

useQueryPersistence({
  refObject: params,
  defaultValueFn: store.defaultParams,
  key: "q",
  history_push: true,
});

const columns = [
  {
    key: "name",
    sortable: true,
    width: "25%",
    thAlign: "left",
    tdAlign: "left",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "file_type",
    label: "File Type",
    sortable: true,
    width: "10%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "genome",
    label: "Genome",
    width: "12%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "dataset",
    label: "Dataset",
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "projects",
    label: "Projects",
    width: "18%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    width: "8%",
    thAlign: "center",
    tdAlign: "center",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "updated_at",
    label: "Updated",
    sortable: true,
    width: "7%",
    thAlign: "center",
    tdAlign: "center",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "actions",
    label: "Actions",
    width: "5%",
    thAlign: "right",
    tdAlign: "right",
  },
];

function fetch_items() {
  data_loading.value = true;
  const filters_api = {
    ...filters.value,
    ...(params.value.inclusive_query
      ? { name: params.value.inclusive_query }
      : null),
  };
  if (filters_api.created_at) {
    filters_api.created_at_start = filters_api.created_at.start;
    filters_api.created_at_end = filters_api.created_at.end;
    delete filters_api.created_at;
  }
  if (filters_api.updated_at) {
    filters_api.updated_at_start = filters_api.updated_at.start;
    filters_api.updated_at_end = filters_api.updated_at.end;
    delete filters_api.updated_at;
  }
  trackService.getAll({
    limit: query.value.page_size,
    offset: offset.value,
    sort_by: query.value.sort_by,
    sort_order: query.value.sort_order,
    ...filters_api,
  })
    .then((res) => {
      tracks.value = res.data?.tracks || [];
      total_results.value = res.data?.metadata?.count || 0;
    })
    .finally(() => {
      data_loading.value = false;
    });
}

onMounted(() => {
  fetch_items();
});

// when sort by or sort order changes, set current page to 1 and fetch items
// when page size changes, set current page to 1 and fetch items
watch(
  [
    () => query.value.sort_by,
    () => query.value.sort_order,
    () => query.value.page_size,
  ],
  () => {
    if (query.value.page === 1) {
      fetch_items();
    } else {
      // change current page to 1 triggers the watch on currPage and fetches
      // items
      query.value.page = 1;
    }
  },
);

// when page changes, fetch items
watch(() => query.value.page, fetch_items);

// inclusive_query is changed from multiple locations, do not watch it directly
// instead rely on VaInput's update:model-value event to fetch items
const handleMainFilter = useDebounceFn((value) => {
  params.value.inclusive_query = value;
  if (query.value.page === 1) {
    fetch_items();
  } else {
    // change current page to 1 triggers the watch on currPage and fetches items
    query.value.page = 1;
  }
}, 300);

function handleSearch() {
  // clear the search input when search is emitted either from filter chips or
  // from search modal
  params.value.inclusive_query = null;
  if (query.value.page === 1) {
    fetch_items();
  } else {
    // change current page to 1 triggers the watch on currPage and fetches items
    query.value.page = 1;
  }
}

function viewTrack(track) {
  // TODO: Implement track viewer/genome browser integration
  console.log('View track:', track);
}

async function deleteTrack(trackId) {
  // Check if user has admin/operator role
  if (!auth.canOperate) {
    toast.error('Admin/operator access required');
    return;
  }

  if (confirm('Are you sure you want to delete this track?')) {
    try {
      await store.deleteTrack(trackId);
      toast.success('Track deleted successfully');
      fetch_items();
    } catch (err) {
      console.error('Failed to delete track:', err);
      toast.error('Failed to delete track');
    }
  }
}
</script> 