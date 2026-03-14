<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>ID</td>
          <td>{{ props.dataset.id }}</td>
        </tr>
        <tr>
          <td>Start Date</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.dataset.created_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.dataset.updated_at) }}
            </span>
            <span>
              {{ datetime.fromNow(null) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Source Instrument</td>
          <td>
            {{ props.dataset.src_instrument?.name }}
          </td>
        </tr>
        <tr>
          <td>Source Path</td>
          <td>
            <span>{{ props.dataset.origin_path }}</span>
          </td>
        </tr>
        <tr>
          <td>Size</td>
          <td>
            <span v-if="props.dataset.du_size">
              {{ formatBytes(props.dataset.du_size) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Files</td>
          <td>{{ props.dataset.num_files }}</td>
        </tr>
        <tr v-if="auth.isFeatureEnabled('genomeBrowser')">
          <td>Genome Files</td>
          <td>{{ props.dataset.metadata?.num_genome_files }}</td>
        </tr>
        <tr>
          <td>Directories</td>
          <td>{{ props.dataset.num_directories }}</td>
        </tr>
        <!--        <tr>-->
        <!--          <td>Created By</td>-->
        <!--          <td>-->
        <!--            {{ datasetCreatorDisplayed }}-->
        <!--          </td>-->
        <!--        </tr>-->
        <tr v-if="props.dataset.create_method">
          <td>Created via</td>
          <td>
            <div class="flex items-center gap-2">
              <DatasetCreateMethod
                :create-method="props.dataset.create_method"
                :origin-path="props.dataset.origin_path"
              />
              <!-- Admin: link to upload details page -->
              <router-link
                v-if="isUpload && auth.canAdmin"
                :to="`/datasets/uploads/${props.dataset.id}`"
                target="_blank"
                class="va-link"
                title="View upload details"
              >
                <va-icon name="open_in_new" size="small" />
              </router-link>
              <!-- Non-admin: live upload status indicator -->
              <UploadStatusBadge
                v-else-if="isUpload && !auth.canAdmin"
                :status="uploadLogStatus"
                :integrated-status="integratedStatus"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td>Description</td>
          <td>
            <div class="max-h-[11.5rem] overflow-y-scroll">
              {{ props.dataset.description }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import constants from "@/constants";
import DatasetCreateMethod from "@/components/dataset/DatasetCreateMethod.vue";
import UploadStatusBadge from "@/components/dataset/upload/UploadStatusBadge.vue";
import datasetService from "@/services/dataset";
import wfService from "@/services/workflow";

const props = defineProps({ dataset: Object });

const auth = useAuthStore();

const isUpload = computed(
  () => props.dataset?.create_method === constants.DATASET_CREATE_METHODS.UPLOAD,
);

// Integrated workflow status derived from the dataset's workflows array
// (already fetched by Dataset.vue with bundle:true).
const integratedStatus = computed(
  () => wfService.get_integrated_workflow_status(props.dataset?.workflows),
);

// Upload log status — fetched lazily for UPLOAD datasets.
const uploadLogStatus = ref(null);

async function fetchUploadStatus() {
  if (!isUpload.value || !props.dataset?.id) return;
  try {
    const res = await datasetService.getUploadLogByDatasetId(props.dataset.id);
    uploadLogStatus.value = res.data?.status ?? null;
  } catch {
    // silently ignore — badge falls back to unknown/null state
  }
}

// Fetch on mount and re-fetch whenever the dataset id changes.
watch(
  () => props.dataset?.id,
  () => fetchUploadStatus(),
  { immediate: true },
);
</script>

<style lang="scss" scoped>
div.va-table-responsive {
  overflow: auto;

  // first column min width
  td:first-child {
    min-width: 135px;
  }
}
</style>
