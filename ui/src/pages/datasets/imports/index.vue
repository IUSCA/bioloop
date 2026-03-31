<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="!auth.isFeatureEnabled('import')"
  >
    This feature is currently disabled
  </va-alert>

  <div v-else>
    <div class="flex mb-3 gap-3">
      <div class="flex-1">
        <va-input
          v-model="filterInput"
          class="w-full"
          placeholder="Type / to search Dataset Imports"
          outline
          clearable
          input-class="search-input"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <div class="flex-none">
        <va-button
          icon="add"
          class="px-1"
          color="success"
          @click="router.push('/datasets/imports/new')"
        >
          Import Dataset
        </va-button>
      </div>
    </div>

    <va-data-table :items="pastImports" :columns="columns" :loading="loading">
      <template #cell(status)="{ rowData }">
        <div
          v-if="rowData.integrated_status === 'ACTIVE'"
          class="flex justify-center"
        >
          <va-popover message="Registration in progress">
            <half-circle-spinner
              class="flex-none"
              :animation-duration="1000"
              :size="24"
              :color="colors.warning"
            />
          </va-popover>
        </div>
        <div
          v-else-if="rowData.integrated_status === 'SUCCESS'"
          class="flex justify-center"
        >
          <va-popover message="Registration completed successfully">
            <va-icon name="check_circle" color="success" />
          </va-popover>
        </div>
        <div
          v-else-if="rowData.integrated_status === 'FAILURE'"
          class="flex justify-center"
        >
          <va-popover message="Registration failed">
            <va-icon name="warning" color="warning" />
          </va-popover>
        </div>
      </template>

      <template #cell(imported_dataset)="{ rowData }">
        <div v-if="!auth.canOperate">
          {{ rowData.imported_dataset.name }}
        </div>
        <router-link
          v-else
          :to="`/datasets/${rowData.imported_dataset.id}`"
          class="va-link"
        >
          {{ rowData.imported_dataset.name }}
        </router-link>
      </template>

      <template #cell(imported_dataset_type)="{ value }">
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
        <span v-if="rowData.user"
          >{{ rowData.user.name }} ({{ rowData.user.username }})</span
        >
      </template>

      <template #cell(initiated_at)="{ value }">
        <span class="text-sm lg:text-base" v-if="value">
          {{ datetime.date(value) }}
        </span>
      </template>
    </va-data-table>

    <Pagination
      v-model:page="currentPageIndex"
      v-model:page_size="pageSize"
      :total_results="total_results"
      :curr_items="pastImports.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />
  </div>
</template>

<script setup>
import DatasetType from "@/components/dataset/DatasetType.vue";
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import config from "@/config";
import datasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { Icon } from "@iconify/vue";
import { HalfCircleSpinner } from "epic-spinners";
import _ from "lodash";
import { useColors } from "vuestic-ui";

const { colors } = useColors();
const nav = useNavStore();
const router = useRouter();
const auth = useAuthStore();

nav.setNavItems([{ label: "Dataset Imports" }]);

useSearchKeyShortcut();

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const ACTIVE_STATES = ["PENDING", "STARTED"];

const filterInput = ref("");
const pastImports = ref([]);
const _datasets = ref({});

const currentPageIndex = ref(1);
const pageSize = ref(10);
const total_results = ref(0);
const loading = ref(false);

const offset = computed(() => (currentPageIndex.value - 1) * pageSize.value);

const search_query = computed(() => {
  return filterInput.value?.length > 0 && { dataset_name: filterInput.value };
});

const imports_batching_query = computed(() => {
  return { offset: offset.value, limit: pageSize.value };
});

const filter_query = computed(() => {
  return {
    ...imports_batching_query.value,
    ...(!!search_query.value && { ...search_query.value }),
    username: auth.user?.username,
    forSelf: !auth.canOperate,
  };
});

const columns = [
  {
    key: "status",
    label: "Status",
    width: "8%",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "imported_dataset",
    label: "Imported Dataset",
    thAlign: "center",
    tdAlign: "center",
    tdStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "imported_dataset_type",
    label: "Dataset Type",
    width: "12%",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "source_dataset",
    label: "Source Raw Data",
    width: "18%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "user",
    label: "Imported By",
    width: "20%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "initiated_at",
    label: "Imported On",
    width: "12%",
    thAlign: "right",
    tdAlign: "right",
    thStyle: "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const getIntegratedWorkflowStatus = (workflows) => {
  const integratedWorkflows = (workflows || []).filter(
    (workflow) => workflow.name === "integrated",
  );

  if (integratedWorkflows.length === 0) return null;

  const latestWorkflow = integratedWorkflows[integratedWorkflows.length - 1];
  if (!latestWorkflow.status) return null;

  if (ACTIVE_STATES.includes(latestWorkflow.status)) return "ACTIVE";
  if (latestWorkflow.status === "SUCCESS") return "SUCCESS";
  return "FAILURE";
};

const getImportLogs = async () => {
  loading.value = true;
  return datasetService
    .getDatasetImportLogs(filter_query.value)
    .then((res) => {
      pastImports.value = res.data.imports.map((dataset) => {
        const status = getIntegratedWorkflowStatus(dataset.workflows);
        const createAuditLog = dataset.audit_logs?.[0];
        return {
          imported_dataset: dataset,
          source_dataset:
            dataset.source_datasets.length > 0
              ? dataset.source_datasets[0].source_dataset
              : null,
          imported_dataset_type: dataset.type,
          initiated_at: dataset.created_at,
          user: createAuditLog?.user,
          integrated_status: status,
        };
      });
      total_results.value = res.data.metadata.count;
    })
    .catch((err) => {
      toast.error("Could not retrieve past imports");
      console.error("Error fetching import logs:", err);
    })
    .finally(() => {
      loading.value = false;
    });
};

watch(
  pastImports,
  () => {
    _datasets.value = pastImports.value.reduce((acc, obj) => {
      acc[obj.imported_dataset.id] = obj.imported_dataset;
      return acc;
    }, {});
  },
  {
    immediate: true,
  },
);

const tracking = computed(() => {
  return pastImports.value
    .filter((imp) => imp.integrated_status === "ACTIVE")
    .map((imp) => imp.imported_dataset.id);
});

function fetch_and_update_dataset(id) {
  datasetService
    .getById({ id, include_projects: false, bundle: true })
    .then((res) => {
      _datasets.value[id] = res.data;
      const importIndex = pastImports.value.findIndex(
        (imp) => imp.imported_dataset.id === id,
      );
      if (importIndex !== -1) {
        pastImports.value[importIndex].imported_dataset = res.data;
        pastImports.value[importIndex].integrated_status =
          getIntegratedWorkflowStatus(res.data.workflows);
      }
    })
    .catch((err) => {
      console.error("Unable to fetch dataset", id, err);
    });
}

function poll_datasets() {
  tracking.value.forEach(fetch_and_update_dataset);
}

const poll = useIntervalFn(
  () => {
    poll_datasets();
  },
  config.dataset_polling_interval,
  {
    immediate: false,
  },
);

watch(tracking, () => {
  if (tracking.value.length > 0) {
    poll.resume();
  } else {
    poll.pause();
  }
});

onMounted(() => {
  getImportLogs();
});

watch(filterInput, () => {
  currentPageIndex.value = 1;
});

watch(filter_query, (newQuery, oldQuery) => {
  if (!_.isEqual(newQuery, oldQuery)) {
    getImportLogs();
  }
});
</script>

<route lang="yaml">
meta:
  title: Dataset Imports
</route>
