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
        <tr v-if="config.enabledFeatures.genomeBrowser">
          <td>Genome Files</td>
          <td>{{ props.dataset.metadata?.num_genome_files }}</td>
        </tr>
        <tr>
          <td>Directories</td>
          <td>{{ props.dataset.num_directories }}</td>
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
import { formatBytes } from "@/services/utils";
import * as datetime from "@/services/datetime";
import config from "@/config";

const props = defineProps({ dataset: Object });
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
