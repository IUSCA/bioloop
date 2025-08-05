<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1" v-if="activeFilters.length === 0">
        <va-input
          :model-value="query.inclusive_query"
          class="w-full"
          placeholder="Search Tracks by name"
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
        :filters="filters"
        @search="handleSearch"
        @open="searchModal.show()"
        @remove-filter="removeFilter"
        @clear-all="clearFilters"
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
        <va-chip size="small">{{  value }}</va-chip>
      </template>

      <template #cell(genomeType)="{ rowData }">
        <va-chip size="small" outline>{{ rowData.genomeType }}</va-chip>
      </template>

      <template #cell(genomeValue)="{ rowData }">
        <va-chip size="small" outline>{{ rowData.genomeValue }}</va-chip>
      </template>

      <template #cell(dataset)="{ rowData }">
        <router-link 
          :to="`/datasets/${rowData.dataset_file?.dataset?.id}`" 
          class="va-link"
        >
          {{ rowData.dataset_file?.dataset?.name }}
        </router-link>
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
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useTracksStore } from "@/stores/tracks";
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

useSearchKeyShortcut();

const router = useRouter();
const store = useTracksStore();
const auth = useAuthStore();

const PAGE_SIZE_OPTIONS = [25, 50, 100];

// Reactive data
const tracks = ref([]);
const data_loading = ref(false);
const total_results = ref(0);
const searchModal = ref(null);

// Query parameters
const query = ref({
  page: 1,
  page_size: 25,
  sort_by: 'created_at',
  sort_order: 'desc',
});

// Filters
const filters = ref({
  project_id: null,
  file_type: null,
  genome_type: null,
  genome_value: null,
  name: null,
});

// Default values function for query persistence
const defaultParams = () => ({
  page: 1,
  page_size: 25,
  sort_by: 'created_at',
  sort_order: 'desc',
});

const defaultFilters = () => ({
  project_id: null,
  file_type: null,
  genome_type: null,
  genome_value: null,
  name: null,
});

// Active filters computed
const activeFilters = computed(() => {
  const active = [];
  Object.entries(filters.value).forEach(([key, value]) => {
    if (value && value !== '') {
      active.push({ key, value });
    }
  });
  return active;
});

// Offset for pagination
const offset = computed(() => (query.value.page - 1) * query.value.page_size);

// Query persistence
useQueryPersistence({
  refObject: query,
  defaultValueFn: defaultParams,
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
  },
  {
    key: "genomeType",
    label: "Genome Type",
    width: "10%",
    thAlign: "center",
    tdAlign: "center",    
  },
  {
    key: "genomeValue",
    label: "Genome Value",
    width: "10%",
    thAlign: "center",
    tdAlign: "center",    
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

async function fetch_items() {
  data_loading.value = true;
  
  try {
    const params = {
      ...filters.value,
      ...(query.value.inclusive_query ? { name: query.value.inclusive_query } : {}),
      limit: query.value.page_size,
      offset: offset.value,
      sort_by: query.value.sort_by,
      sort_order: query.value.sort_order,
    };

    const response = await store.fetchTracks(params);
    tracks.value = response.tracks;
    total_results.value = response.metadata.count;
  } catch (error) {
    console.error('Error fetching tracks:', error);
    toast.error('Failed to fetch tracks');
  } finally {
    data_loading.value = false;
  }
}

function handleMainFilter(value) {
  query.value.inclusive_query = value;
  query.value.page = 1; // Reset to first page when searching
}

function handleSearch(searchFilters) {
  filters.value = { ...searchFilters };
  query.value.page = 1; // Reset to first page when filtering
}

function removeFilter(key) {
  filters.value[key] = '';
  query.value.page = 1; // Reset to first page when removing filter
}

function clearFilters() {
  filters.value = {
    project_id: null,
    file_type: null,
    genome_type: null,
    genome_value: null,
    name: null,
  };
  query.value.page = 1; // Reset to first page when clearing filters
}

async function deleteTrack(id) {
  if (confirm('Are you sure you want to delete this track?')) {
    try {
      await store.deleteTrack(id);
      toast.success('Track deleted successfully');
      await fetch_items(); // Refresh the list
    } catch (error) {
      console.error('Error deleting track:', error);
      toast.error('Failed to delete track');
    }
  }
}

function viewTrack(track) {
  router.push(`/tracks/${track.id}`);
}

// Watch for changes in query and filters
watch([query, filters], () => {
  fetch_items();
}, { deep: true });

// Initial load
onMounted(() => {
  fetch_items();
});
</script> 