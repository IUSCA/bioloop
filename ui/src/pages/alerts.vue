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
    <va-button @click="showFilterAlertsModal" preset="primary" class="flex-none">
      <i-mdi-filter />
      <span>
        Filters
        <span v-if="activeFilters.length > 0" class="ml-1">
          ({{ activeFilters.length }})
        </span>
      </span>
    </va-button>

    <!-- Currently active filters -->
    <AlertSearchFilters
      v-if="activeFilters.length > 0"
      class="flex-1"
      @search="handleSearch"
    />

    <!-- New Alert button -->
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
    <!-- Start/End Time -->
    <template #cell(start_time)="{ value }">
      <span>{{ value ? datetime.displayDateTime(value) : null }}</span>
    </template>
    <template #cell(end_time)="{ value }">
      <span>{{ value ? datetime.displayDateTime(value) : null }}</span>
    </template>

    <!-- Type -->
    <template #cell(type)="{ value }">
      <va-badge :text="value" :color="alertService.getAlertColor(value)" />
    </template>

    <!-- Is alert hidden? -->
    <template #cell(is_hidden)="{ value }">
      <va-popover :message="strToBool(value) ? 'Hidden' : 'Visible'">
      <span v-if="strToBool(value)" class="flex justify-center">
        <i-mdi-eye-off-outline class="va-text-secondary" />
      </span>
      <span v-else class="flex justify-center">
        <i-mdi-eye-outline  class="va-text-primary" />
      </span>
    </va-popover>
    </template>

    <!-- Status -->
    <template #cell(status)="{ value }">
      <va-badge :text="value" :color="alertService.getStatusColor(value)" />
    </template>

    <!-- Message -->
    <template #cell(message)="{ value }">
      <va-popover
        v-if="value && value.length > 80"
        :message="value"
        placement="top"
        trigger="hover"
        keep-anchor-width
      >
        <span class="cursor-help">{{ trimAlertMessage(value) }}</span>
      </va-popover>
      <span v-else>{{ value || '' }}</span>
    </template>

    <!-- Created By -->
    <template #cell(created_by)="{ rowData }">
      <span>{{ rowData.created_by.name }} ({{ rowData.created_by.username }})</span>
    </template>

    <!-- Actions -->
    <template #cell(actions)="{ rowData }">
      <div class="flex gap-3 flex-nowrap justify-end">
        <va-popover message="Edit Alert">
          <va-button preset="plain" @click="showEditAlertModal(rowData)">
            <div>
              <i-mdi-pencil />
            </div>
          </va-button>
        </va-popover>
      </div>
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

  <CreateOrEditAlertModal 
    ref="createOrEditModal"
    @save="onSave"
  />
  
  <AlertSearchModal
    ref="alertsFilterModal"
    @search="handleSearch"
  />
</template>

<script setup>
import alertService from "@/services/alert";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";
import { VaPopover } from "vuestic-ui";

const columns = [
  {
    key: "label",
    width: "10%",
    sortable: true,
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
    key: "status",
    width: "5%",
    thAlign: "center",
    tdAlign: "center",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "is_hidden",
    label: "Visible",
    width: "5%",
    thAlign: "center",
    tdAlign: "center",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "start_time",
    label: "Start Time",
    width: "11%",
    sortable: true,
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
    width: "11%",
    sortable: true,
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
    width: "6%",
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

const filter_query = computed(() => {
  const baseQuery = {
    ...query.value,
    ...filters.value,
    label: searchQuery.value,
    offset: (params.value.query.page - 1) * params.value.query.pageSize,
    limit: params.value.query.pageSize,
  };

  // Convert simple date objects to operator objects
  if (baseQuery.start_time && baseQuery.start_time instanceof Date) {
    baseQuery.start_time = { gte: baseQuery.start_time };
  }
  if (baseQuery.end_time && baseQuery.end_time instanceof Date) {
    baseQuery.end_time = { lte: baseQuery.end_time };
  }

  return baseQuery;
});

const loading = ref(false);
const alerts = ref([]);
const totalAlertsCount = ref(0);
const searchQuery = ref("");

const createOrEditModal = ref(null);
const alertsFilterModal = ref(null);

const fetchAlerts = async () => {
  loading.value = true;
  try {
    const response = await alertService.getAll(filter_query.value);
    alerts.value = response.data.alerts;
    totalAlertsCount.value = response.data.metadata.count;
  } catch (error) {
    toast.error("Failed to fetch alerts");
  } finally {
    loading.value = false;
    await alertStore.fetchAlerts();
  }
};

const showNewAlertModal = () => {
  createOrEditModal.value.showModal();
};

const showEditAlertModal = (alert) => {
  createOrEditModal.value.showModal(alert);
};

const showFilterAlertsModal = () => {
  alertsFilterModal.value.show();
};

const trimAlertMessage = (message) => {
  return message.length > 80 ? `${message.substring(0, 80)}...` : message;
};

const handleSearch = useDebounceFn(() => {
  params.value.query.page = 1;
  fetchAlerts();
}, 500);

const onSave = async () => {
  await fetchAlerts();
};

const strToBool = (value) => {
  return value === "true" || value === "True";
};

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

onMounted(fetchAlerts);
</script>

<route lang="yaml">
meta:
  title: Alerts
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Alerts" }]
</route>
