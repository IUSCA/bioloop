<template>
  <!-- search bar and filter -->
  <div class="flex mb-3 gap-3">
    <!-- search bar -->
    <div class="flex-1">
      <va-input
        v-model="filterInput"
        class="w-full"
        placeholder="Type / to search Datasets"
        outline
        clearable
        input-class="search-input"
      >
        <template #prependInner>
          <Icon icon="material-symbols:search" class="text-xl" />
        </template>
      </va-input>
    </div>

    <!-- filter -->
    <div class="flex-none flex items-center justify-center">
      <DatasetFiltersGroup
        :filters="['staged']"
        @update="updateFiltersGroupQuery"
      />
    </div>
  </div>

  <va-data-table
    :items="rows"
    :columns="columns"
    v-model:sort-by="defaultSortField"
    v-model:sorting-order="defaultSortOrder"
    class="min-h-[100px]"
    :loading="loading"
    @sorted="
      (attrs) => {
        defaultSortField = attrs.sortBy;
        defaultSortOrder = attrs.sortingOrder;
      }
    "
  >
    <template #cell(name)="{ rowData }">
      <router-link
        :to="`/projects/${props.project.slug}/datasets/${rowData.id}`"
        class="va-link"
        v-if="auth.canOperate"
      >
        {{ rowData.name }}
      </router-link>
      <span v-else> {{ rowData.name }} </span>
    </template>

    <template #cell(type)="{ value }">
      <DatasetType :type="value" class="" show-icon />
    </template>

    <template #cell(stage)="{ rowData }">
      <!-- dataset is staged -->
      <div v-if="rowData.is_staged">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="cloud_sync"
          disabled
        />
      </div>
      <div v-else class="flex justify-center">
        <!-- dataset is not staged and has not been archived yet -->
        <va-button
          v-if="!rowData.archive_path"
          class="shadow"
          preset="primary"
          color="info"
          icon="cloud_sync"
          disabled
        />
        <!-- dataset is not staged and is being staged -->
        <va-popover
          v-else-if="rowData.is_staging_pending"
          :message="'Dataset is being staged'"
        >
          <half-circle-spinner
            class="flex-none"
            :animation-duration="1000"
            :size="24"
            :color="colors.warning"
          />
        </va-popover>
        <!-- dataset is not staged and is not being staged -->
        <va-button
          v-else
          class="shadow flex-none"
          preset="primary"
          color="info"
          icon="cloud_sync"
          @click="openModalToStageProject(rowData)"
        />
      </div>
    </template>

    <template #cell(download)="{ rowData }">
      <div class="">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="cloud_download"
          @click="openModalToDownloadProject(rowData)"
          :disabled="!rowData.is_staged"
        />
      </div>
    </template>

    <!-- <template #cell(share)="{ rowData }">
      <div class="">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="share"
          @click="openModalToShareProject(rowData)"
        />
      </div>
    </template> -->

    <template #cell(metadata)="{ rowData }">
      <maybe :data="rowData?.metadata?.num_genome_files" />
    </template>

    <template #cell(du_size)="{ source }">
      <span>{{ source != null ? formatBytes(source) : "" }}</span>
    </template>

    <template #cell(updated_at)="{ value }">
      <span>{{ datetime.date(value) }}</span>
    </template>

    <template #cell(assigned)="{ rowData }">
      <div class="text-sm">
        <div v-if="rowData?.assignor">
          by
          <span class="font-semibold">
            {{ rowData.assignor.username }}
          </span>
        </div>
        <div>on {{ datetime.date(rowData.assigned_at) }}</div>
      </div>
    </template>
  </va-data-table>

  <Pagination
    data-testid="project-datasets-pagination"
    v-model:page="currentPageIndex"
    v-model:page_size="pageSize"
    :total_results="total_results"
    :curr_items="projectDatasets.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />

  <!-- Download Modal -->
  <DatasetDownloadModal ref="downloadModal" :dataset="datasetToDownload" />

  <!-- Stage Modal -->
  <StageDatasetModal
    ref="stageModal"
    :dataset="datasetToStage"
    @update="fetch_and_update_dataset"
  />
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import projectService from "@/services/projects";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import wfService from "@/services/workflow";
import { useAuthStore } from "@/stores/auth";
import { HalfCircleSpinner } from "epic-spinners";
import _ from "lodash";
import { useColors } from "vuestic-ui";

const { colors } = useColors();
const auth = useAuthStore();

const props = defineProps({
  project: {
    type: Object,
  },
  triggerDatasetsRetrieval: {
    // If true, triggers datasets' re-retrieval
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["datasets-retrieved"]);

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const pageSize = ref(10);
const total_results = ref(0);

const _triggerDatasetsRetrieval = toRef(() => props.triggerDatasetsRetrieval);
const projectIdRef = toRef(() => props.project.id);
const loading = ref(false);

const projectDatasets = ref([]);
const _datasets = ref({});
const filterInput = ref("");

// Criteria for group of true/false fields that results can be filtered by
const filters_group_query = ref({});

const defaultSortField = ref("updated_at");
const defaultSortOrder = ref("desc");

const currentPageIndex = ref(1);

// used for OFFSET clause in the SQL used to retrieve the next paginated batch
// of results
const offset = computed(() => (currentPageIndex.value - 1) * pageSize.value);

// Criterion based on search input
const search_query = computed(() => {
  return filterInput.value?.length > 0 && { name: filterInput.value };
});

// Aggregation of all filtering criteria. Used for retrieving results, and
// configuring number of pages for pagination.
const datasets_filter_query = computed(() => {
  return {
    ...filters_group_query.value,
    ...(!!search_query.value && { ...search_query.value }),
  };
});

// Criterion for sorting. Initial sorting order is based on the `updated_at`
// field. The sorting criterion can be updated, which will trigger a call to
// retrieve the updated search results. Note - va-data-table supports sorting by
// one column at a time, so this object should always have a single key-value
// pair.
let datasets_sort_query = computed(() => {
  return { [defaultSortField.value]: defaultSortOrder.value };
});

// Criteria used to limit the number of results retrieved, and to define the
// offset starting at which the next batch of results will be retrieved.
const datasets_batching_query = computed(() => {
  return { skip: offset.value, take: pageSize.value };
});

// Aggregate of all other criteria. Used for retrieving results according to
// the criteria specified.
const datasets_retrieval_query = computed(() => {
  return {
    ...datasets_filter_query.value,
    ...datasets_batching_query.value,
    sortBy: datasets_sort_query.value,
  };
});

const updateFiltersGroupQuery = (newVal) => {
  filters_group_query.value = newVal;
};

const fetch_project_datasets = () => {
  loading.value = true;
  if (!props.project.id) return [];
  projectService
    .getDatasets({
      id: props.project.id,
      params: datasets_retrieval_query.value,
    })
    .then((res) => {
      projectDatasets.value = res.data.datasets;
      total_results.value = res.data.metadata.count;
      emit("datasets-retrieved");
    })
    .catch(() => {
      toast.error("Failed to retrieve datasets");
    })
    .finally(() => {
      loading.value = false;
    });
};

watch(_triggerDatasetsRetrieval, () => {
  if (_triggerDatasetsRetrieval.value) {
    currentPageIndex.value = 1;
    fetch_project_datasets();
  }
});

// _datasets is a mapping of dataset_ids to dataset objects. While polling one
// or more datasets, this object is updated with latest dataset values.
watch(
  projectDatasets,
  () => {
    _datasets.value = projectDatasets.value.reduce((acc, obj) => {
      acc[obj.id] = obj;
      return acc;
    }, {});
  },
  {
    immediate: true,
  },
);

watch([datasets_sort_query, datasets_filter_query], () => {
  // when sorting or filtering criteria changes, show results starting from the
  // first page
  currentPageIndex.value = 1;
});

watch(datasets_retrieval_query, (newQuery, oldQuery) => {
  // Retrieve updated results whenever retrieval criteria changes
  if (!_.isEqual(newQuery, oldQuery)) {
    fetch_project_datasets();
  }
});

const rows = computed(() => {
  return Object.values(_datasets.value).map((ds) => {
    const assoc = getCurrentProjAssoc(ds.projects) || {};
    const { assigned_at, assignor } = assoc;
    return {
      ...ds,
      assigned_at,
      assignor,
      is_staging_pending: wfService.is_step_pending("VALIDATE", ds.workflows),
    };
  });
});

const tracking = computed(() => {
  const t = rows.value.filter((ds) => ds.is_staging_pending).map((ds) => ds.id);
  // console.log("tracking", t);
  return t;
});

function fetch_and_update_dataset(id) {
  // console.log("fetch_and_update_dataset", id);
  DatasetService.getById({ id, include_projects: true })
    .then((res) => {
      _datasets.value[id] = res.data;
    })
    .catch((err) => {
      console.error("unable to fetch dataset", id, err);
    });
}

function poll_datasets() {
  tracking.value.forEach(fetch_and_update_dataset);
}

const poll = useIntervalFn(
  () => {
    // console.log("polling", tracking.value, _datasets.value);
    poll_datasets();
  },
  config.dataset_polling_interval,
  {
    immediate: false,
  },
);

// Once a project id has been obtained, fetch the associated datasets
watch(projectIdRef, () => {
  fetch_project_datasets();
});

watch(tracking, () => {
  // console.log("watch tracking", tracking.value.length);
  if (tracking.value.length > 0) {
    // start poll
    poll.resume();
  } else {
    // stop poll
    poll.pause();
  }
});

/**
 * Results are fetched in batches for efficient pagination,
 * but the sorting criteria specified needs to query all of persistent storage
 * (as opposed to the current batch of retrieved results). Hence,
 * va-data-table's default sorting behavior (which would normally only sort the
 * current batch of results) is overridden (by providing each column with a
 * `sortingFn` prop that does nothing), and instead,
 * network calls are made to run the sorting criteria across all of persistent
 * storage. The field to sort the results by and the sort order are captured in
 * va-data-table's 'sorted' event, and added to the sorting criteria maintained
 * in the `datasets_sort_query` reactive variable.
 */
const columns = computed(() => [
  {
    key: "name",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
  },
  { key: "stage", width: "70px", thAlign: "center", tdAlign: "center" },
  { key: "download", width: "100px", thAlign: "center", tdAlign: "center" },
  // { key: "share", width: "70px", thAlign: "center", tdAlign: "center" },
  {
    key: "type",
    sortable: true,
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
  },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
  },
  {
    key: "metadata",
    label: "data files",
    sortable: false,
  },
  {
    key: "du_size",
    label: "size",
    sortable: true,
    sortingFn: () => {}, // overrides va-data-table's default sorting behavior
  },
  ...(auth.canOperate
    ? [
        {
          key: "assigned",
        },
      ]
    : []),
]);

// download modal
const downloadModal = ref(null);
const datasetToDownload = ref(null);

function openModalToDownloadProject(dataset) {
  datasetToDownload.value = dataset;
  downloadModal.value.show();
}

// stage modal
const stageModal = ref(null);
const datasetToStage = ref({});

function openModalToStageProject(dataset) {
  datasetToStage.value = dataset;
  stageModal.value.show();
}

function getCurrentProjAssoc(assocs) {
  return assocs?.filter((obj) => obj.project_id === props.project.id)?.[0];
}
</script>
