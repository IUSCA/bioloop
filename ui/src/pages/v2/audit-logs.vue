<template>
  <div>
    <VaDataTable
      :items="auditRecords"
      :columns="[
        { key: 'id' },
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'event_type', label: 'Event Type' },
        { key: 'details', label: 'Details' },
      ]"
      class="audit-logs-table"
      striped
    >
      <template #cell(timestamp)="{ source }">
        <span class="text-sm">
          {{ datetime.displayDateTime(source) }}
        </span>
      </template>

      <template #cell(event_type)="{ value }">
        <span class="text-sm font-medium lowercase">
          {{ value }}
        </span>
      </template>

      <template #cell(details)="{ rowData }">
        <AuditLogEntry :record="rowData" class="text-sm" />
      </template>
    </VaDataTable>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import AuditLogsService from "@/services/v2/audit-logs";

// Provide context to child components so they can conditionally render group details based on whether we're in a group
// context or not (e.g. if we're on a specific group's page,
// we don't need to show the group name in each audit log entry related to that group since it's implied)
provide("context", "group");

const auditRecords = ref([]);
const loading = ref(false);
const error = ref(null);

function fetchAuditLogs() {
  loading.value = true;
  error.value = null;

  AuditLogsService.getAuditRecords()
    .then((res) => {
      auditRecords.value = res.data;
    })
    .catch((err) => {
      error.value = "Failed to load audit logs.";
      console.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
}

onMounted(() => {
  fetchAuditLogs();
});
</script>

<route lang="yaml">
meta:
  title: "Audit Logs"
  nav: [{ label: "Audit Logs", path: "/audit-logs" }]
</route>
