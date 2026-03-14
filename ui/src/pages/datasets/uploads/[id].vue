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
                No logs available yet
              </div>
            </va-inner-loading>
          </va-card-content>
        </va-card>

        <!-- No Logs Message -->
        <va-card v-else>
          <va-card-content>
            <div class="text-center py-8">
              <Icon icon="mdi:information-outline" class="text-4xl mb-2" />
              <div>No verification task logs available for this upload.</div>
              <div class="text-sm mt-1">
                Logs will appear here once verification begins.
              </div>
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
  } catch (err) {
    console.error('Failed to fetch upload:', err);
  } finally {
    loading.value = false;
  }
};

// Fetch verification logs
const fetchLogs = async () => {
  if (!upload.value?.metadata?.worker_process_id) {
    return;
  }

  loadingLogs.value = true;
  try {
    const processId = upload.value.metadata.worker_process_id;
    const response = await fetch(
      `/api/workflows/processes/${processId}/logs`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch logs');
    }

    const data = await response.json();
    logs.value = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  } finally {
    loadingLogs.value = false;
  }
};

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
  
  if (upload.value?.metadata?.worker_process_id) {
    await fetchLogs();
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
