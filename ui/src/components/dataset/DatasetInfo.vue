<template>
  <div class="va-table-responsive" data-testid="dataset-info">
    <table class="va-table">
      <tbody>
        <tr data-testid="dataset-id">
          <td>ID</td>
          <td>{{ props.dataset.id }}</td>
        </tr>
        <tr data-testid="dataset-start-date">
          <td>Start Date</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.dataset.created_at) }}
            </span>
          </td>
        </tr>
        <tr data-testid="dataset-last-updated">
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
        <tr data-testid="dataset-origin-path">
          <td>Source Path</td>
          <td>
            <span>{{ props.dataset.origin_path }}</span>
          </td>
        </tr>
        <tr data-testid="dataset-size">
          <td>Size</td>
          <td>
            <span v-if="props.dataset.du_size">
              {{ formatBytes(props.dataset.du_size) }}
            </span>
          </td>
        </tr>
        <tr data-testid="dataset-files">
          <td>Files</td>
          <td>{{ props.dataset.num_files }}</td>
        </tr>
        <tr
          v-if="
            isFeatureEnabled({
              featureKey: 'genomeBrowser',
              hasRole: auth.hasRole,
            })
          "
          data-testid="dataset-genome-files"
        >
          <td>Genome Files</td>
          <td>{{ props.dataset.metadata?.num_genome_files }}</td>
        </tr>
        <tr data-testid="dataset-directories">
          <td>Directories</td>
          <td>{{ props.dataset.num_directories }}</td>
        </tr>
        <tr data-testid="dataset-description">
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
import { formatBytes, isFeatureEnabled } from "@/services/utils";
import * as datetime from "@/services/datetime";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({ dataset: Object });

const auth = useAuthStore();
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
