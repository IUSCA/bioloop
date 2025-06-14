<template>
  <!-- search bar and filter -->
  <div class="flex mb-3 gap-3">
    <!-- search bar -->
    <div class="flex-1" v-if="activeFilters.length === 0">
      <va-input
        v-model="searchQuery"
        class="w-full"
        placeholder="Search alerts"
        outline
        clearable
        @update:model-value="handleSearch"
      >
        <template #prependInner>
          <Icon icon="material-symbols:search" class="text-xl" />
        </template>
      </va-input>
    </div>

    <!-- Filter button -->
    <va-button @click="showSearchModal" preset="primary" class="flex-none">
      <i-mdi-filter />
      <span>
        Filters
        <span v-if="activeFilters.length > 0" class="ml-1">
          ({{ activeFilters.length }})
        </span>
      </span>
    </va-button>

    <!-- active filters -->
    <AlertSearchFilters
      v-if="activeFilters.length > 0"
      class="flex-1"
      @search="handleSearch"
    />
    <!--    @open="showSearchModal"-->

    <va-button
      icon="add"
      class="px-1"
      color="success"
      @click="showNewAlertModal"
    >
      New Alert
    </va-button>
  </div>

  <va-data-table
    :items="alerts"
    :columns="columns"
    v-model:sort-by="params.query.sort_by"
    v-model:sorting-order="params.query.sort_order"
    disable-client-side-sorting
    hoverable
    :loading="loading"
  >
    <template #cell(start_time)="{ value }">
      <span>{{ datetime.displayDateTime(value) }}</span>
    </template>

    <template #cell(end_time)="{ value }">
      <span>{{ value ? datetime.displayDateTime(value) : null }}</span>
    </template>

    <template #cell(type)="{ value }">
      <va-badge :text="value" :color="alertService.getAlertColor(value)" />
    </template>

    <template #cell(active)="{ rowData }">
      <span v-if="isAlertActive(rowData)" class="flex justify-center">
        <i-mdi-check-circle-outline class="text-green-700" />
      </span>
    </template>

    <template #cell(message)="{ value }">
      {{ trimAlertMessage(value) }}
    </template>

    <template #cell(created_by)="{ rowData }">
      <span
        >{{ rowData.created_by.name }} ({{ rowData.created_by.username }})</span
      >
    </template>

    <template #cell(actions)="{ rowData }">
      <!--      <div class="flex gap-1">-->
      <va-button
        class="flex-auto"
        preset="plain"
        icon="edit"
        @click="showEditAlertModal(rowData)"
      />
      <!--        <va-button-->
      <!--          class="flex-auto"-->
      <!--          preset="plain"-->
      <!--          icon="delete"-->
      <!--          color="danger"-->
      <!--          @click="showDeleteAlertModal(rowData)"-->
      <!--        />-->
      <!--      </div>-->
    </template>
  </va-data-table>

  <Pagination
    class="mt-4 px-1 lg:px-3"
    v-model:page="params.query.page"
    v-model:page_size="params.query.pageSize"
    :total_results="totalAlertsCount"
    :curr_items="alerts.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />

  <CreateOrEditAlertModal ref="createOrEditModal" @update="fetchAlerts" />
  <DeleteAlertModal ref="deleteModal" @update="fetchAlerts" />
  <AlertSearchModal
    ref="searchModal"
    @search="
      () => {
        // console.log('searching...');
        handleSearch();
      }
    "
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import alertService from "@/services/alert";
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";

const columns = [
  {
    key: "label",
    width: "15%",
    thAlign: "left",
    tdAlign: "left",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "message",
    sortable: false,
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "type",
    width: "10%",
    thAlign: "center",
    tdAlign: "center",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "active",
    width: "10%",
    thAlign: "center",
    tdAlign: "center",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "start_time",
    label: "Start Time",
    width: "7%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "end_time",
    label: "End Time",
    width: "7%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "created_by",
    width: "15%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "actions",
    width: "7%",
    sortable: false,
    thAlign: "right",
    tdAlign: "right",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const alertStore = useAlertStore();
const { filters, query, params, activeFilters } = storeToRefs(alertStore);

const filter_query = computed(() => ({
  ...query.value,
  ...filters.value,
  label: searchQuery.value,
}));

const loading = ref(false);

const alerts = ref([]);
const totalAlertsCount = ref(0);

const searchQuery = ref("");

const createOrEditModal = ref(null);
const deleteModal = ref(null);
const searchModal = ref(null);

const fetchAlerts = async () => {
  loading.value = true;
  try {
    const response = await alertService.getAll(filter_query.value);
    // console.log(response);
    alerts.value = response.data.alerts;
    totalAlertsCount.value = response.data.metadata.count;
  } catch (error) {
    toast.error("Failed to fetch alerts");
  } finally {
    loading.value = false;
  }
};

const showNewAlertModal = () => {
  createOrEditModal.value.showModal();
};

const showEditAlertModal = (alert) => {
  createOrEditModal.value.showModal(alert);
};

const showSearchModal = () => {
  searchModal.value.show();
};

const trimAlertMessage = (message) => {
  return message.length > 80 ? `${message.substring(0, 100)}...` : message;
};

const isAlertActive = (alert) => {
  const now = new Date();
  return (
    new Date(alert.start_time) <= now &&
    (!alert.end_time || new Date(alert.end_time) > now)
  );
};

const handleSearch = useDebounceFn(() => {
  params.value.query.page = 1;
  fetchAlerts();
}, 500);

// const handleFilterChange = () => {
//   params.value.page = 1;
//   fetchAlerts();
// };

watch(
  [
    () => params.value.query.sort_by,
    () => params.value.query.sort_order,
    () => params.value.query.pageSize,
  ],
  () => {
    if (params.value.query.page === 1) {
      fetchAlerts();
    } else {
      params.value.query.page = 1;
    }
  },
);

watch(() => params.value.query.page, fetchAlerts);

watch(
  () => activeFilters.value,
  () => {
    console.log("filters changed");
  },
);

onMounted(fetchAlerts);
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Alerts
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Alerts" }]
</route>
