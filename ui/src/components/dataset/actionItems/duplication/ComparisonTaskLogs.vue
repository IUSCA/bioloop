<template>
  <!-- Admin-only: opens a modal showing the Celery task logs for the comparison run. -->
  <div v-if="auth.canAdmin" class="flex items-center gap-3">
    <va-button
      preset="secondary"
      icon="receipt_long"
      size="small"
      :disabled="!process && !loading"
      :loading="loading"
      data-testid="view-comparison-logs-btn"
      @click="openModal"
    >
      View Comparison Logs
    </va-button>
    <span
      v-if="process"
      class="font-mono text-xs text-[var(--va-text-secondary)]"
    >
      task {{ process.task_id.slice(0, 8) }}…
    </span>
    <span
      v-else-if="!loading"
      class="text-xs text-[var(--va-text-secondary)]"
      data-testid="comparison-logs-no-process"
    >
      No comparison process registered yet.
    </span>
  </div>

  <!-- Logs modal -->
  <va-modal
    v-model="showModal"
    title="Comparison Task Logs"
    size="large"
    data-testid="comparison-logs-modal"
  >
    <div class="flex flex-col gap-3">
      <!-- Process metadata -->
      <div v-if="process" class="flex flex-wrap gap-4 text-sm text-[var(--va-text-secondary)]">
        <span><strong>PID:</strong> {{ process.pid }}</span>
        <span><strong>Host:</strong> {{ process.hostname }}</span>
        <span>
          <strong>Task ID:</strong>
          <span class="font-mono text-xs">{{ process.task_id }}</span>
        </span>
      </div>

      <!-- Log viewer -->
      <WorkflowLogs
        v-if="process"
        :process-id="process.id"
        :key="process.id"
        data-testid="comparison-logs-viewer"
      />

      <div v-else class="text-[var(--va-text-secondary)] text-sm py-2">
        No comparison process record found.
        The task may not have started yet or the process was not registered.
      </div>
    </div>
  </va-modal>
</template>

<script setup>
import WorkflowLogs from "@/components/runs/workflowLogs/WorkflowLogs.vue";
import workflowService from "@/services/workflow";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  comparisonProcessId: { type: String, default: null },
});

const auth = useAuthStore();

const process = ref(null);
const loading = ref(false);
const showModal = ref(false);
let retryTimer = null;

function openModal() {
  showModal.value = true;
}

async function fetchProcess() {
  if (!props.comparisonProcessId) return;
  loading.value = true;
  try {
    const res = await workflowService.getWorkflowProcesses({
      task_id: props.comparisonProcessId,
    });
    process.value = (res.data || [])[0] ?? null;
  } catch (err) {
    console.error("Failed to fetch comparison process", err);
  } finally {
    loading.value = false;
  }
}

function stopRetry() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

function startRetry() {
  if (retryTimer || process.value || !props.comparisonProcessId) return;
  retryTimer = setInterval(async () => {
    if (process.value || !props.comparisonProcessId) {
      stopRetry();
      return;
    }
    await fetchProcess();
    if (process.value) stopRetry();
  }, 3000);
}

watch(
  () => props.comparisonProcessId,
  async (taskId) => {
    stopRetry();
    process.value = null;
    if (!taskId) return;
    await fetchProcess();
    if (!process.value) startRetry();
  },
  { immediate: true },
);

onUnmounted(() => {
  stopRetry();
});
</script>
