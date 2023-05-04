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
            {{ utc_date_to_local_tz(props.dataset.created_at) }}
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span class="">
              {{ utc_date_to_local_tz(props.dataset.updated_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Source Path</td>
          <td>{{ props.dataset.origin_path }}</td>
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
        <tr>
          <td>Genome Files</td>
          <td>{{ props.dataset.num_genome_files }}</td>
        </tr>
        <tr>
          <td>Directories</td>
          <td>{{ props.dataset.num_directories }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import { formatBytes, utc_date_to_local_tz } from "../../services/utils";
const props = defineProps({ dataset: Object });
</script>
