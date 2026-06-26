<template>
  <VaCard>
    <VaCardContent>
      <div v-if="error" class="my-4">
        <ErrorState :message="error" @retry="fetchAuditLogs" />
      </div>

      <div v-else>
        <div v-if="auditRecords?.length > 0" class="space-y-2">
          <AuditLog
            :record="record"
            v-for="record in auditRecords"
            :key="record.id"
            class="border-b border-solid border-slate-300 dark:border-slate-700 pb-2 last:border-b-0"
          />
        </div>

        <div
          v-else-if="!loading"
          class="text-center flex flex-col items-center gap-2 py-8 text-sm text-gray-500 dark:text-gray-400"
        >
          <p>No audit logs yet.</p>
          <span>Audit events will appear here when changes are made.</span>
        </div>

        <div
          v-show="loading"
          class="text-sm text-center py-4 text-gray-500 dark:text-gray-400"
        >
          Loading...
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import AuditLogsService from "@/services/v2/audit-logs";

const props = defineProps({
  datasetId: { type: String, required: true },
});

provide("context", "dataset");

const auditRecords = ref([]);
const loading = ref(false);
const error = ref(null);

async function fetchAuditLogs() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await AuditLogsService.getAuditRecords({
      filter: {
        target_id: props.datasetId,
      },
      limit: 50,
    });
    auditRecords.value = data || [];
  } catch (err) {
    error.value = "Failed to load audit logs.";
    console.error(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchAuditLogs();
});

watch(() => props.datasetId, fetchAuditLogs);
</script>
