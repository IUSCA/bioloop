<template>
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
        Upload Data Product
      </va-button>
    </div>
  </div>

  <!-- table -->
  <va-data-table :items="uploads" :columns="columns">
    <template #cell(status)="{ value }">
      <va-chip size="small" :color="getStatusChipColor(value)">
        {{ value }}
      </va-chip>
    </template>

    <template #cell(uploaded_dataset)="{ rowData }">
      <router-link
        :to="`/datasets/${rowData.uploaded_dataset.id}`"
        class="va-link"
        >{{ rowData.uploaded_dataset.name }}</router-link
      >
    </template>

    <template #cell(source_dataset)="{ rowData }">
      <router-link
        v-if="rowData.source_dataset"
        :to="`/datasets/${rowData.source_dataset.id}`"
        class="va-link"
      >
        {{ rowData.source_dataset.name }}
      </router-link>
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
    :curr_items="uploads.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import config from "@/config";
import datasetUploadService from "@/services/upload/dataset";
import { useNavStore } from "@/stores/nav";
import _ from "lodash";
import toast from "@/services/toast";
import * as datetime from "@/services/datetime";

const nav = useNavStore();
const router = useRouter();

nav.setNavItems([{ label: "Dataset Uploads" }]);

useSearchKeyShortcut();

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const filterInput = ref("");
const pastUploads = ref([]);
const uploads = computed(() => {
  return pastUploads.value.map((upload) => {
    const uploaded_dataset = upload.dataset;
    const source_dataset =
      uploaded_dataset.source_datasets.length > 0
        ? uploaded_dataset.source_datasets[0].source_dataset
        : null;
    return {
      ...upload,
      status: upload.upload_log?.status,
      user: upload.upload_log?.user,
      source_dataset,
      uploaded_dataset,
    };
  });
});

const currentPageIndex = ref(1);
const pageSize = ref(20);
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
  };
});

const columns = [
  { key: "status", width: "5%" },
  {
    key: "uploaded_dataset",
    label: "Uploaded Data Product",
    width: "30%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "source_dataset",
    label: "Source Dataset",
    width: "30%",
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
    width: "25%",
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
  console.log("received value for Upload Status", value);

  let color;
  switch (value) {
    case config.upload.status.UPLOADING:
    case config.upload.status.UPLOADED:
    case config.upload.status.PROCESSING:
      color = "primary";
      break;
    case config.upload.status.UPLOAD_FAILED:
      color = "warning";
      break;
    case config.upload.status.COMPLETE:
      color = "success";
      break;
    case config.upload.status.PROCESSING_FAILED:
    case config.upload.status.FAILED:
      color = "danger";
      break;
    default:
      console.log("received unexpected value for Upload Status", value);
  }
  return color;
};

const getUploadLogs = async () => {
  return datasetUploadService
    .getDatasetUploadLogs(filter_query.value)
    .then((res) => {
      pastUploads.value = res.data.uploads.map((e) => {
        return {
          ...e,
          initiated_at: e.upload_log.initiated_at,
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
  requiresRoles: ["operator", "admin"]
</route>
