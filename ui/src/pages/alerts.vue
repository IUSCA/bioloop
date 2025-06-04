<template>
  <div class="flex gap-3 mb-3">
    <div class="flex-none">
      <va-button
        icon="add"
        class="px-1"
        color="success"
        @click="showNewAlertModal"
      >
        New Alert
      </va-button>
    </div>
  </div>

  <va-data-table
    :items="alerts"
    :columns="columns"
    v-model:sort-by="params.sortBy"
    v-model:sorting-order="params.sortingOrder"
    disable-client-side-sorting
    hoverable
    :loading="loading"
  >
    <template #cell(created_at)="{ value }">
      <span>{{ datetime.date(value) }}</span>
    </template>

    <template #cell(type)="{ value }">
      <va-badge
        :color="
          value === 'ERROR'
            ? 'danger'
            : value === 'WARNING'
              ? 'warning'
              : 'info'
        "
      >
        {{ value }}
      </va-badge>
    </template>

    <template #cell(active)="{ value }">
      <va-badge :color="value ? 'success' : 'danger'">
        {{ value ? "Active" : "Inactive" }}
      </va-badge>
    </template>

    <template #cell(message)="{ value }">
      {{ trimAlertMessage(value) }}
    </template>

    <template #cell(global)="{ value }">
      <va-badge :color="value ? 'primary' : 'secondary'">
        {{ value ? "Global" : "Local" }}
      </va-badge>
    </template>

    <template #cell(created_by)="{ rowData }">
      <span
        >{{ rowData.created_by.name }} ({{ rowData.created_by.username }})</span
      >
    </template>

    <template #cell(actions)="{ rowData }">
      <div class="flex gap-1">
        <va-button
          class="flex-auto"
          preset="plain"
          icon="edit"
          @click="showEditAlertModal(rowData)"
        />
        <va-button
          class="flex-auto"
          preset="plain"
          icon="delete"
          color="danger"
          @click="showDeleteAlertModal(rowData)"
        />
      </div>
    </template>
  </va-data-table>

  <Pagination
    class="mt-4 px-1 lg:px-3"
    v-model:page="params.page"
    v-model:page_size="params.pageSize"
    :total_results="totalAlertsCount"
    :curr_items="alerts.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />

  <CreateOrEditAlertModal ref="createOrEditModal" @update="fetchAlerts" />

  <DeleteAlertModal ref="deleteModal" @update="fetchAlerts" />
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import alertService from "@/services/alert";
import CreateOrEditAlertModal from "@/components/alerts/CreateOrEditAlertModal.vue";
import DeleteAlertModal from "@/components/alerts/DeleteAlertModal.vue";

const columns = [
  {
    key: "label",
    width: "15%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "message",
    sortable: false,
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "type",
    width: "10%",
  },
  {
    key: "active",
    width: "10%",
  },
  {
    key: "global",
    sortable: true,
    width: "10%",
  },
  {
    key: "created_by",
    width: "15%",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "created_at",
    label: "Created At",
    width: "15%",
    thAlign: "right",
    tdAlign: "right",
  },
  {
    key: "actions",
    width: "10%",
    sortable: false,
  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const loading = ref(false);
const alerts = ref([]);
const totalAlertsCount = ref(0);

const params = ref({
  page: 1,
  pageSize: 10,
  sortBy: "created_at",
  sortingOrder: "desc",
});

const offset = computed(() => (params.value.page - 1) * params.value.pageSize);

const filter_query = computed(() => ({
  offset: offset.value,
  limit: params.value.pageSize,
  sortBy: params.value.sortBy,
  sortingOrder: params.value.sortingOrder,
}));

const createOrEditModal = ref(null);
const deleteModal = ref(null);

const fetchAlerts = async () => {
  loading.value = true;
  try {
    const response = await alertService.getAll(filter_query.value);
    console.log(response);
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

const showDeleteAlertModal = (alert) => {
  deleteModal.value.showModal(alert);
};

const trimAlertMessage = (message) => {
  return message.length > 100 ? `${message.substring(0, 100)}...` : message;
};

onMounted(fetchAlerts);
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Alerts
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Alerts" }]
</route>
