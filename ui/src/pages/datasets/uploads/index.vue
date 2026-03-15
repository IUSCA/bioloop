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
          @click="router.push('/datasets/uploads/new')"
        >
          Upload Dataset
        </va-button>
      </div>
    </div>

    <!-- table -->
    <va-data-table :items="pastUploads" :columns="columns" :loading="loading">
      <template #cell(link)="{ rowData }">
        <router-link
          :to="`/datasets/uploads/${rowData.uploaded_dataset.id}`"
          class="va-link"
        >
          <Icon icon="mdi:open-in-new" />
        </router-link>
      </template>

      <template #cell(status)="{ rowData }">
        <!-- Upload still in progress -->
        <div v-if="rowData.status === constants.UPLOAD_STATUSES.UPLOADING" class="flex justify-center">
          <va-popover message="Upload in progress">
            <half-circle-spinner
              class="flex-none"
              :animation-duration="1000"
              :size="24"
              :color="colors.primary"
            />
          </va-popover>
        </div>
        <!-- Upload complete, waiting for processing -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.UPLOADED" class="flex justify-center">
          <va-popover message="Processing pending">
            <half-circle-spinner
              class="flex-none"
              :animation-duration="1000"
              :size="24"
              :color="colors.warning"
            />
          </va-popover>
        </div>
        <!-- Upload verification in progress -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.VERIFYING" class="flex justify-center">
          <va-popover message="Verifying upload">
            <half-circle-spinner
              class="flex-none"
              :animation-duration="1000"
              :size="24"
              :color="colors.info"
            />
          </va-popover>
        </div>
        <!-- Upload verified successfully -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.VERIFIED" class="flex justify-center">
          <va-popover message="Upload verified">
            <va-icon name="check_circle_outline" color="success" />
          </va-popover>
        </div>
        <!-- Integrated workflow running -->
        <div v-else-if="rowData.integrated_status === 'ACTIVE'" class="flex justify-center">
          <va-popover message="Registration in progress">
            <half-circle-spinner
              class="flex-none"
              :animation-duration="1000"
              :size="24"
              :color="colors.warning"
            />
          </va-popover>
        </div>
        <!-- Integrated workflow succeeded -->
        <div v-else-if="rowData.integrated_status === 'SUCCESS'" class="flex justify-center">
          <va-popover message="Registration completed successfully">
            <va-icon name="check_circle" color="success" />
          </va-popover>
        </div>
        <!-- Integrated workflow failed -->
        <div v-else-if="rowData.integrated_status === 'FAILURE'" class="flex justify-center">
          <va-popover message="Registration failed">
            <va-icon name="warning" color="warning" />
          </va-popover>
        </div>
        <!-- Upload verification failed -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.VERIFICATION_FAILED" class="flex justify-center">
          <va-popover :message="rowData.metadata?.failure_reason ? `Verification failed: ${rowData.metadata.failure_reason}` : 'Upload verification failed'">
            <va-icon name="error" color="danger" />
          </va-popover>
        </div>
        <!-- Permanently failed -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.PERMANENTLY_FAILED" class="flex justify-center">
          <va-popover :message="rowData.metadata?.failure_reason ? `Permanently failed: ${rowData.metadata.failure_reason}` : 'Upload permanently failed — all retries exhausted'">
            <va-icon name="error" color="danger" />
          </va-popover>
        </div>
        <!-- Processing failed -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.PROCESSING_FAILED" class="flex justify-center">
          <va-popover :message="rowData.metadata?.failure_reason ? `Processing failed: ${rowData.metadata.failure_reason}` : 'Processing failed'">
            <va-icon name="error" color="danger" />
          </va-popover>
        </div>
        <!-- Processing (workflow triggered but not yet detected) -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.PROCESSING" class="flex justify-center">
          <va-popover message="Processing">
            <half-circle-spinner
              class="flex-none"
              :animation-duration="1000"
              :size="24"
              :color="colors.warning"
            />
          </va-popover>
        </div>
        <!-- Complete (upload finished, no integrated workflow found) -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.COMPLETE" class="flex justify-center">
          <va-popover message="Upload complete">
            <va-icon name="check_circle" color="success" />
          </va-popover>
        </div>
        <!-- Upload failed -->
        <div v-else-if="rowData.status === constants.UPLOAD_STATUSES.UPLOAD_FAILED" class="flex justify-center">
          <va-popover :message="rowData.metadata?.failure_reason ? `Upload failed: ${rowData.metadata.failure_reason}` : 'Upload failed'">
            <va-icon name="error" color="danger" />
          </va-popover>
        </div>
        <!-- Fallback: unknown status -->
        <div v-else class="flex justify-center">
          <va-popover :message="`Status: ${rowData.status || 'Unknown'}`">
            <va-icon name="help_outline" color="secondary" />
          </va-popover>
        </div>
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
        <DatasetType v-if="value" :type="value" :show-icon="true" />
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
import DatasetType from "@/components/dataset/DatasetType.vue";
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import config from "@/config";
import constants from "@/constants";
import datasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { Icon } from '@iconify/vue';
import { HalfCircleSpinner } from "epic-spinners";
import _ from "lodash";
import { useColors } from "vuestic-ui";

const { colors } = useColors();
const nav = useNavStore();
const router = useRouter();
const auth = useAuthStore();

nav.setNavItems([{ label: "Dataset Uploads" }]);

useSearchKeyShortcut();

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const filterInput = ref("");
const pastUploads = ref([]);
const _datasets = ref({}); // Mapping of dataset_id to dataset object for polling

const currentPageIndex = ref(1);
const pageSize = ref(10);
const total_results = ref(0);
const loading = ref(false);
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

const columns = computed(() => {
  const baseColumns = [
    {
      key: "status",
      label: "Status",
      width: auth.canAdmin ? "6%" : "8%",
      thAlign: "center",
      tdAlign: "center",
    },
    {
      key: "uploaded_dataset",
      label: "Uploaded Dataset",
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
      width: auth.canAdmin ? "10%" : "12%",
      thAlign: "center",
      tdAlign: "center",
    },
    {
      key: "source_dataset",
      label: "Source Raw Data",
      width: auth.canAdmin ? "12%" : "15%",
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
      width: auth.canAdmin ? "12%" : "15%",
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
      width: auth.canAdmin ? "8%" : "10%",
      thAlign: "right",
      tdAlign: "right",
      thStyle:
        "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    },
  ];

  // Add link column at the start for admins
  if (auth.canAdmin) {
    return [
      {
        key: "link",
        label: "Upload Details",
        width: "8%",
        thAlign: "center",
        tdAlign: "center",
      },
      ...baseColumns,
    ];
  }

  return baseColumns;
});

/**
 * Computes a single display status from an array of workflows by inspecting
 * the most-recent "integrated" workflow.
 *
 * Returns:
 *   'ACTIVE'   — workflow is running (PENDING or STARTED)
 *   'SUCCESS'  — workflow completed successfully
 *   'FAILURE'  — workflow ended in any other terminal state
 *   null       — no integrated workflow exists yet
 */
const get_integrated_workflow_status = (workflows) => {
  const ACTIVE_STATES = ['PENDING', 'STARTED'];

  const integratedWorkflows = (workflows || []).filter(
    (wf) => wf.name === 'integrated',
  );

  if (integratedWorkflows.length === 0) {
    return null;
  }

  const latestWorkflow = integratedWorkflows[integratedWorkflows.length - 1];

  if (!latestWorkflow.status) {
    return null;
  }

  if (ACTIVE_STATES.includes(latestWorkflow.status)) {
    return 'ACTIVE';
  }

  if (latestWorkflow.status === 'SUCCESS') {
    return 'SUCCESS';
  }

  return 'FAILURE';
}

const getUploadLogs = async () => {
  loading.value = true;
  return datasetService
    .getDatasetUploadLogs(filter_query.value)
    .then((res) => {
      pastUploads.value = res.data.uploads.map((e) => {
        let uploaded_dataset = e.dataset;
        const status = get_integrated_workflow_status(uploaded_dataset.workflows);
        // Get user from create audit log (filtered by action='create', only one exists)
        const createAuditLog = uploaded_dataset.audit_logs?.[0];
        return {
          ...e,
          initiated_at: uploaded_dataset.created_at,
          user: createAuditLog?.user,
          uploaded_dataset,
          source_dataset:
            uploaded_dataset.source_datasets.length > 0
              ? uploaded_dataset.source_datasets[0].source_dataset
              : null,
          uploaded_dataset_type: uploaded_dataset.type,
          integrated_status: status,
        };
      });
      total_results.value = res.data.metadata.count;
    })
    .catch((err) => {
      toast.error("Could not retrieve past uploads");
      console.error("Error fetching upload logs:", err);
    })
    .finally(() => {
      loading.value = false;
    });
};

// _datasets is a mapping of dataset_ids to dataset objects. While polling one
// or more datasets, this object is updated with latest dataset values.
watch(
  pastUploads,
  () => {
    _datasets.value = pastUploads.value.reduce((acc, obj) => {
      acc[obj.uploaded_dataset.id] = obj.uploaded_dataset;
      return acc;
    }, {});
  },
  {
    immediate: true,
  }
);

// Track uploads that need polling (active workflows or pending processing)
const tracking = computed(() => {
  return pastUploads.value
    .filter((upload) => 
      upload.integrated_status === 'ACTIVE' ||
      upload.status === constants.UPLOAD_STATUSES.UPLOADED
    )
    .map((upload) => upload.uploaded_dataset.id);
});

// Fetch and update a single dataset's workflow status
function fetch_and_update_dataset(id) {
  datasetService
    .getById({ id, include_projects: false, bundle: true })
    .then((res) => {
      _datasets.value[id] = res.data;
      // Update the corresponding upload in pastUploads
      const uploadIndex = pastUploads.value.findIndex(
        (upload) => upload.uploaded_dataset.id === id
      );
      if (uploadIndex !== -1) {
        pastUploads.value[uploadIndex].uploaded_dataset = res.data;
        pastUploads.value[uploadIndex].integrated_status = get_integrated_workflow_status(
          res.data.workflows
        );
      }
    })
    .catch((err) => {
      console.error("Unable to fetch dataset", id, err);
    });
}

// Poll datasets with pending workflows
function poll_datasets() {
  tracking.value.forEach(fetch_and_update_dataset);
}

// Set up polling interval
const poll = useIntervalFn(
  () => {
    poll_datasets();
  },
  config.dataset_polling_interval,
  {
    immediate: false,
  }
);

// Start/stop polling based on whether there are datasets to track
watch(tracking, () => {
  if (tracking.value.length > 0) {
    poll.resume();
  } else {
    poll.pause();
  }
});

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
