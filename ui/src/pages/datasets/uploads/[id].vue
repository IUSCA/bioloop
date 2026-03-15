<template>
  <div class="px-4 py-6">
    <va-inner-loading :loading="loading">
      <div v-if="upload">
        <!-- Upload Overview Card -->
        <va-card class="mb-4">
          <va-card-title>
            <div class="flex flex-nowrap items-center w-full">
                <span class="flex-auto text-lg"> Upload Overview </span>
              </div>
            </va-card-title>
          <va-card-content>
            <div class="va-table-responsive">
              <table class="va-table">
                <tbody>
                  <tr>
                    <td>Uploaded</td>
                    <td>
                      <router-link
                        :to="getDatasetURL(upload)"
                        class="va-link"
                      >
                          {{ getDatasetDisplayName(upload) }}
                      </router-link>
                    </td>
                  </tr>
                  <!-- <tr>
                    <td>Entity Type</td>
                    <td>
                      <va-chip size="small" outline>Dataset</va-chip>
                    </td>
                  </tr> -->
                  <tr>
                    <td>Status</td>
                    <td>
                      <va-chip
                        :color="getStatusColor(upload.status)"
                        size="small"
                      >
                        {{ upload.status }}
                      </va-chip>
                    </td>
                  </tr>
                  <tr>
                    <td>Last Updated</td>
                    <td>{{ formatDate(upload.updated_at) }}</td>
                  </tr>
                  <tr v-if="upload.process_id">
                    <td>Process ID</td>
                    <td><code class="text-sm">{{ upload.process_id }}</code></td>
                  </tr>
                  <tr v-if="upload.metadata?.verification_task_id">
                    <td>Verification Task ID</td>
                    <td><code class="text-sm">{{ upload.metadata.verification_task_id }}</code></td>
                  </tr>
                  <tr v-if="upload.metadata?.worker_process_id">
                    <td>Worker Process ID</td>
                    <td><code class="text-sm">{{ upload.metadata.worker_process_id }}</code></td>
                  </tr>
                  <tr v-if="upload.retry_count > 0">
                    <td>Retry Count</td>
                    <td>{{ upload.retry_count }}</td>
                  </tr>
                  <tr v-if="upload.metadata?.checksum">
                    <td>Checksum Algorithm</td>
                    <td><code>{{ upload.metadata.checksum.algorithm }}</code></td>
                  </tr>
                  <tr v-if="upload.metadata?.checksum">
                    <td>File Count</td>
                    <td>{{ upload.metadata.checksum.file_count }}</td>
                  </tr>
                  <tr v-if="upload.metadata?.checksum">
                    <td>Manifest Hash</td>
                    <td><code class="text-xs">{{ upload.metadata.checksum.manifest_hash }}</code></td>
                  </tr>
                  <tr v-if="upload.metadata?.failure_reason">
                    <td>Failure Reason</td>
                    <td>
                      <va-alert color="danger" class="mb-0">
                        {{ upload.metadata.failure_reason }}
                      </va-alert>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </va-card-content>
        </va-card>

        <!-- Verification Task Logs Card -->
        <va-card v-if="upload.metadata?.worker_process_id">
          <va-card-title>

            <div class="flex flex-nowrap items-center w-full">
              <span class="flex-auto text-lg"> Verification Task Logs </span>
            </div>
          </va-card-title>
          <va-card-content>
            <va-inner-loading :loading="loadingLogs">
              <div v-if="logs.length > 0" class="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm overflow-x-auto" style="max-height: 600px; overflow-y: auto;">
                <div v-for="(log, index) in logs" :key="index" class="mb-1 whitespace-pre-wrap">
                  <span :class="getLogLevelClass(log.level)">
                    [{{ formatLogTime(log.created_at) }}] {{ log.level.toUpperCase() }}: {{ log.message }}
                  </span>
                </div>
              </div>
              <div v-else class="text-center py-8">
                <div class="font-medium">No logs available yet.</div>
                <div class="text-sm mt-2 text-gray-500">
                  The verification task registered its process ID but has not written any log entries yet.
                  This usually resolves within a few seconds — the page refreshes automatically every 10 s.
                </div>
              </div>
            </va-inner-loading>
          </va-card-content>
        </va-card>

        <!-- No Logs Message — shown when worker_process_id is absent -->
        <va-card v-else>
          <va-card-content>
            <div class="text-center py-8">
              <Icon icon="mdi:information-outline" class="text-4xl mb-2" />
              <div class="font-medium">No verification task logs available for this upload.</div>
              <div class="text-sm mt-2 text-gray-500 max-w-lg mx-auto">{{ noLogsExplanation }}</div>
            </div>
          </va-card-content>
        </va-card>
      </div>
    </va-inner-loading>
  </div>
</template>

<script setup>
import constants from '@/constants';
import datasetService from '@/services/dataset.js';
import wfService from '@/services/workflow.js';
import { useNavStore } from '@/stores/nav';
import { Icon } from '@iconify/vue';
import { useToast } from 'vuestic-ui';

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
});

const toast = useToast();
const nav = useNavStore();

const loading = ref(true);
const loadingLogs = ref(false);
const upload = ref(null);
const logs = ref([]);
let refreshInterval = null;

// Fetch upload details
const fetchUpload = async () => {
  try {
    const response = await datasetService.getUploadLogByDatasetId(props.id);
    upload.value = response.data;
    // Stop polling as soon as a terminal state is observed so we don't
    // keep firing requests after the upload has permanently settled.
    if (isTerminalStatus(upload.value?.status)) {
      stopAutoRefresh();
    }
  } catch (err) {
    console.error('Failed to fetch upload:', err);
  } finally {
    loading.value = false;
  }
};

// Statuses from which no further automatic state transitions will occur.
// Auto-refresh stops as soon as one of these is observed.
const TERMINAL_STATUSES = new Set([
  constants.UPLOAD_STATUSES.COMPLETE,
  constants.UPLOAD_STATUSES.UPLOAD_FAILED,
  constants.UPLOAD_STATUSES.VERIFICATION_FAILED,
  constants.UPLOAD_STATUSES.PERMANENTLY_FAILED,
]);

const isTerminalStatus = (status) => TERMINAL_STATUSES.has(status);

// Fetch verification logs via the shared workflow service layer.
// No-ops when the worker has not yet written its process ID to upload metadata.
const fetchLogs = async () => {
  if (!upload.value?.metadata?.worker_process_id) {
    return;
  }

  loadingLogs.value = true;
  try {
    const processId = upload.value.metadata.worker_process_id;
    const response = await wfService.getLogs({ processId });
    logs.value = (response.data || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  } finally {
    loadingLogs.value = false;
  }
};

// Contextual explanation for why verification logs are absent, keyed on upload
// status.  Shown only when worker_process_id is not yet in upload metadata.
const noLogsExplanation = computed(() => {
  const status = upload.value?.status;
  const S = constants.UPLOAD_STATUSES;
  switch (status) {
    case S.UPLOADING:
      return 'Files are still being transferred. The upload-management job dispatches a verification task only after the upload reaches UPLOADED status.';
    case S.UPLOAD_FAILED:
      return 'The upload failed before all files were transferred. No verification task was dispatched. Check the Failure Reason above.';
    case S.UPLOADED:
      return 'All files have been received. The upload-management job (runs on a schedule) will dispatch a verification task on its next cycle. Logs will appear here once that task starts.';
    case S.VERIFYING:
      return upload.value?.metadata?.verification_task_id
        ? `A verification task was dispatched (Celery task ID: ${upload.value.metadata.verification_task_id}) but the worker has not yet registered its process ID. This normally resolves within seconds. If it persists, the task may have crashed before it could start logging — check the Celery worker logs.`
        : 'The upload is VERIFYING but no task ID was recorded. The VERIFYING status and task ID are written atomically, so this state is unexpected — the upload-management job may have encountered an error before the write completed. Check the upload-management job logs.';
    case S.VERIFIED:
    case S.PROCESSING_FAILED:
    case S.COMPLETE:
      return 'Verification completed but the worker did not register a process ID — most likely the process-registration API call failed transiently before the subprocess started. The verification outcome is still reflected in the status above.';
    case S.PROCESSING:
      return 'This upload is in a legacy PROCESSING state from a prior retry attempt. It should have been transitioned to COMPLETE or PROCESSING_FAILED automatically. If it persists, check the upload-management job logs.';
    case S.VERIFICATION_FAILED:
    case S.PERMANENTLY_FAILED:
      return 'The verification or processing pipeline reached a terminal failure state before the worker could register its process ID. Check the Failure Reason above for details, and inspect the Celery worker logs on the worker node for the full error.';
    default:
      return 'Logs will appear here once the verification task starts.';
  }
});

// Status helpers
const getStatusColor = (status) => {
  const colorMap = {
    [constants.UPLOAD_STATUSES.UPLOADING]: 'info',
    [constants.UPLOAD_STATUSES.UPLOADED]: 'success',
    [constants.UPLOAD_STATUSES.VERIFYING]: 'info',
    [constants.UPLOAD_STATUSES.VERIFIED]: 'success',
    [constants.UPLOAD_STATUSES.VERIFICATION_FAILED]: 'danger',
    [constants.UPLOAD_STATUSES.PROCESSING]: 'info',
    [constants.UPLOAD_STATUSES.COMPLETE]: 'success',
    [constants.UPLOAD_STATUSES.UPLOAD_FAILED]: 'danger',
    [constants.UPLOAD_STATUSES.PROCESSING_FAILED]: 'danger',
    [constants.UPLOAD_STATUSES.PERMANENTLY_FAILED]: 'danger',
  };
  return colorMap[status] || 'secondary';
};

const getLogLevelClass = (level) => {
  const classMap = {
    error: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-gray-400',
    stdout: 'text-gray-200',
  };
  return classMap[level?.toLowerCase()] || 'text-gray-200';
};

// Date formatting
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString();
};

const formatLogTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString();
};

const getDatasetURL = (upload) => {
  if (upload.dataset) {
    return `/datasets/${upload.dataset.id}`;
  }

  return '';
};

const getDatasetDisplayName = (upload) => {
  if (upload.dataset) {
    return upload.dataset.name;
  } 

  return ''
};



// Auto-refresh (background only, no UI controls)
const startAutoRefresh = () => {
  refreshInterval = setInterval(() => {
    fetchUpload();
    fetchLogs();
  }, 10000);
};

const stopAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

// Lifecycle
onMounted(async () => {
  await fetchUpload();
  
  if (upload.value?.dataset) {
    nav.setNavItems([
      {
        label: 'Uploads',
        to: '/datasets/uploads',
      },
      {
        label: upload.value.dataset.name || `Upload #${props.id}`,
      },
    ]);
  }
  
  // Fetch logs immediately if verification has already started.
  if (upload.value?.metadata?.worker_process_id) {
    await fetchLogs();
  }

  // Poll as long as the upload has not yet reached a terminal state.
  // Each poll invokes fetchUpload(), which stops the interval automatically
  // once a terminal status is observed (or the user navigates away).
  if (!isTerminalStatus(upload.value?.status)) {
    startAutoRefresh();
  }
});

onBeforeUnmount(() => {
  stopAutoRefresh();
});
</script>

<route lang="yaml">
meta:
  title: Upload Details
  requiresRoles: ["admin"]
</route>
