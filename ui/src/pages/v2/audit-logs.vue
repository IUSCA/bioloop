<template>
  <div v-if="error" class="my-12">
    <ErrorState :message="error" class="my-4" @retry="fetchAuditLogs" />
  </div>
  <div v-else>
    <ModernCard
      title="Audit Logs"
      icon="mdi-book-secure"
      ref="el"
      class="h-[calc(100vh-8rem)] min-h-[300px] overflow-scroll scroll-container"
    >
      <div v-if="auditRecords?.length > 0" class="">
        <AuditLog
          :record="record"
          v-for="record in auditRecords || []"
          :key="record.id"
          class="border-b border-solid border-slate-300 dark:border-slate-700 pb-2 mb-2 last:border-b-0"
        />
      </div>
      <div
        v-else
        class="my-12 va-text-secondary text-center flex flex-col items-center gap-2"
      >
        <p>No audit logs to display yet.</p>
        <span>
          Audit logs will appear here when actions are taken in the system.
        </span>
      </div>
      <div v-show="loading" class="text-sm text-secondary text-center my-2">
        Loading more...
      </div>
    </ModernCard>
  </div>
</template>

<script setup>
import AuditLogsService from "@/services/v2/audit-logs";

// Provide context to child components so they can conditionally render group details based on whether we're in a group
// context or not (e.g. if we're on a specific group's page,
// we don't need to show the group name in each audit log entry related to that group since it's implied)
// provide("context", "group");

const auditRecords = ref([]);
const loading = ref(false);
const error = ref(null);

const offset = ref(0);
const limit = ref(30);
const stopLoadingMore = ref(false);

function fetchAuditLogs() {
  loading.value = true;
  error.value = null;

  return AuditLogsService.getAuditRecords({
    offset: offset.value,
    limit: limit.value,
  })
    .then((res) => {
      const rows = res.data;
      if (rows) {
        auditRecords.value.push(...rows);
      }
      if (rows?.length < limit.value) {
        // No more records to load, you can optionally remove the infinite scroll listener here
        stopLoadingMore.value = true;
      }
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

function handleLoadMore() {
  // Placeholder for load more functionality
  // You would typically call an API endpoint to fetch the next page of audit logs and append them to the existing list
  offset.value += limit.value;
  fetchAuditLogs();
}

const el = ref(null);
useInfiniteScroll(
  el,
  handleLoadMore,
  {
    distance: 10,
    canLoadMore: () => !loading.value && !stopLoadingMore.value,
  }, // Trigger 10 pixels before the bottom
);
</script>

<route lang="yaml">
meta:
  title: "Audit Logs"
  nav: [{ label: "Audit Logs", path: "/audit-logs" }]
</route>
