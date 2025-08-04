<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1" v-if="activeFilters.length === 0">
        <va-input
          :model-value="params.inclusive_query"
          class="w-full"
          :placeholder="`Search tracks`"
          outline
          clearable
          @update:model-value="handleMainFilter"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl"/>
          </template>
        </va-input>
      </div>

      <!-- Filter button -->
      <va-button @click="searchModal.show()" preset="primary" class="flex-none">
        <i-mdi-filter/>
        <span>Filters</span>
      </va-button>

      <!-- active filter chips -->
      <TracksSearchFilters
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
      <template #cell(file_name)=" { value }">
        <span>{{ value }}</span>
      </template>

      <template #cell(source)=" { value }">
        <span>{{ value }}</span>
      </template>


      <template #cell(size)=" { value }">
        <span>{{ value != null ? formatBytes(value) : "" }}</span>
      </template>


      <template #cell(created_at)=" { value }">
        <span>{{ datetime.date(value) }}</span>
      </template>


      <template #cell(type)=" { value }">
        <span>{{ value }}</span>
      </template>


      <template #cell(genome)=" { value }">
        <span>{{ value }}</span>
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

    <!-- Modal to create new Session -->
    <CreateSessionModal tracks="" ref="createSessionModal" @ok="createSession"/>

    <TracksSearchModal ref="searchModal" @search="handleSearch"/>
  </div>
</template>

<script setup>
import TrackService from "@/services/track";
import {useTracksStore} from "@/stores/tracks";
import {storeToRefs} from "pinia";
import useQueryPersistence from "@/composables/useQueryPersistence";


const store = useTracksStore();

const {
  filters, query, params, activeFilters
} = storeToRefs(store);

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const tracks = []
const data_loading = ref(false);

const launch_modal = ref({
  // visible: false,
  // selected: null,
});
const searchModal = ref(null);
const createSessionModal = ref(null)

const total_results = ref(0);
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
  },
  // ...(isFeatureEnabled({
  //   featureKey: "genomeBrowser",
  //   hasRole: auth.hasRole,
  // })
  //   ? [
  //     {
  //       key: "num_genome_files",
  //       label: "data files",
  //       width: "80px",
  //     },
  //   ]
  //   : []),

  // { key: "actions", width: "100px" },
];

// when page changes, fetch items
watch(() => query.value.page, fetch_items);

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
  TrackService.getAll({
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

const createSession = (tracks) => {

}

</script>

<route lang="yaml">
  meta:
  title: Tracks
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Tracks" }]
</route>
