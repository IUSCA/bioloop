<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="!auth.isFeatureEnabled('uploads')"
  >
    This feature is currently disabled
  </va-alert>

  <div v-else>
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1">
        <va-input
          v-model="filterInput"
          class="w-full"
          placeholder="Type / to search Dataset Uploads"
          outline
          clearable
          input-class="search-input"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- create button -->
      <div class="flex-none">
        <va-button
          icon="add"
          class="px-1"
          color="success"
          @click="router.push('/datasetUpload/new')"
        >
          Upload Dataset
        </va-button>
      </div>
    </div>

    <!-- table -->
    <va-data-table :items="pastUploads" :columns="columns">
      <template #cell(status)="{ value }">
        <va-chip size="small" :color="getStatusChipColor(value)">
          {{ value }}
        </va-chip>
      </template>

      <template #cell(uploaded_dataset)="{ rowData }">
        <div v-if="!auth.canOperate">
          {{ rowData.uploaded_dataset.name }}
        </div>
        <router-link
          v-else
          :to="`/datasets/${rowData.uploaded_dataset.id}`"
          class="va-link"
        >
          {{ rowData.uploaded_dataset.name }}
        </router-link>
      </template>

      <template #cell(uploaded_dataset_type)="{ value }">
        <va-chip size="small" outline>
          {{ value }}
        </va-chip>
      </template>

      <template #cell(source_dataset)="{ rowData }">
        <div v-if="rowData.source_dataset">
          <div v-if="!auth.canOperate">
            {{ rowData.source_dataset.name }}
          </div>
          <router-link
            v-else
            :to="`/datasets/${rowData.source_dataset.id}`"
            class="va-link"
          >
            {{ rowData.source_dataset.name }}
          </router-link>
        </div>
      </template>

      <template #cell(user)="{ rowData }">
        <span>{{ rowData.user.name }} ({{ rowData.user.username }})</span>
      </template>

      <template #cell(initiated_at)="{ value }">
        <span class="text-sm lg:text-base">
          {{ datetime.date(value) }}
        </span>
      </template>
    </va-data-table>

    <Pagination
      v-model:page="currentPageIndex"
      v-model:page_size="pageSize"
      :total_results="total_results"
      :curr_items="pastUploads.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />
  </div>
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import datasetService from "@/services/dataset";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import _ from "lodash";
import constants from "@/constants";

const nav = useNavStore();
const router = useRouter();
const auth = useAuthStore();

nav.setNavItems([{ label: "Dataset Uploads" }]);

useSearchKeyShortcut();

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const filterInput = ref("");
const pastUploads = ref([]);

const currentPageIndex = ref(1);
const pageSize = ref(10);
const total_results = ref(0);
// used for OFFSET clause in the SQL used to retrieve the next paginated batch
// of results
const offset = computed(() => (currentPageIndex.value - 1) * pageSize.value);
// Criterion based on search input
const search_query = computed(() => {
  return filterInput.value?.length > 0 && { dataset_name: filterInput.value };
});
// Criteria used to limit the number of results retrieved, and to define the
// offset starting at which the next batch of results will be retrieved.
const uploads_batching_query = computed(() => {
  return { offset: offset.value, limit: pageSize.value };
});
// Aggregation of all filtering criteria. Used for retrieving results, and
// configuring number of pages for pagination.
const filter_query = computed(() => {
  return {
    ...uploads_batching_query.value,
    ...(!!search_query.value && { ...search_query.value }),
    username: auth.user?.username,
    forSelf: !auth.canOperate,
  };
});

const columns = [
  { key: "status", width: "5%" },
  {
    key: "uploaded_dataset",
    label: "Uploaded Dataset",
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "uploaded_dataset_type",
    label: "Dataset Type",
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "source_dataset",
    label: "Source Raw Data",
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "user",
    label: "Uploaded By",
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "initiated_at",
    label: "Uploaded On",
    width: "10%",
    thAlign: "right",
    tdAlign: "right",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const getStatusChipColor = (value) => {
  let color;
  switch (value) {
    case constants.UPLOAD_STATUSES.UPLOADING:
    case constants.UPLOAD_STATUSES.UPLOADED:
    case constants.UPLOAD_STATUSES.PROCESSING:
      color = "primary";
      break;
    case constants.UPLOAD_STATUSES.UPLOAD_FAILED:
    case constants.UPLOAD_STATUSES.CHECKSUM_COMPUTATION_FAILED:
      color = "warning";
      break;
    case constants.UPLOAD_STATUSES.COMPLETE:
      color = "success";
      break;
    case constants.UPLOAD_STATUSES.PROCESSING_FAILED:
      color = "danger";
      break;
    default:
      console.log("received unexpected value for Upload Status", value);
  }
  return color;
};

const getUploadLogs = async () => {
  return datasetService
    .getDatasetUploadLogs(filter_query.value)
    .then((res) => {
      pastUploads.value = res.data.uploads.map((e) => {
        let uploaded_dataset = e.audit_log.dataset;
        return {
          ...e,
          initiated_at: e.audit_log.timestamp,
          user: e.audit_log.user,
          uploaded_dataset,
          source_dataset:
            uploaded_dataset.source_datasets.length > 0
              ? uploaded_dataset.source_datasets[0].source_dataset
              : null,
          uploaded_dataset_type: uploaded_dataset.type,
        };
      });
      total_results.value = res.data.metadata.count;
    })
    .catch((err) => {
      toast.error("Could not retrieve past uploads");
      console.error("Error fetching upload logs:", err);
    });
};

onMounted(() => {
  getUploadLogs();
});

watch(filterInput, () => {
  currentPageIndex.value = 1;
});

watch(filter_query, (newQuery, oldQuery) => {
  // Retrieve updated results whenever retrieval criteria changes
  if (!_.isEqual(newQuery, oldQuery)) {
    getUploadLogs();
  }
});
</script>

<route lang="yaml">
meta:
  title: Dataset Uploads
</route>
