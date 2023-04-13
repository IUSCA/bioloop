<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>ID</td>
          <td>{{ props.batch.id }}</td>
        </tr>
        <tr>
          <td>Start Date</td>
          <td>
            {{ utc_date_to_local_tz(props.batch.created_at) }}
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span class="">
              {{ utc_date_to_local_tz(props.batch.updated_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Source Path</td>
          <td>{{ props.batch.origin_path }}</td>
        </tr>
        <tr>
          <td>Total Size</td>
          <td>
            <span v-if="props.batch.du_size">
              {{ formatBytes(props.batch.du_size) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Total Files</td>
          <td>{{ props.batch.num_files }}</td>
        </tr>
        <tr>
          <td>Total Genome Files</td>
          <td>{{ props.batch.num_genome_files }}</td>
        </tr>
        <tr>
          <td>Total Directories</td>
          <td>{{ props.batch.num_directories }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import { formatBytes, utc_date_to_local_tz } from "../../services/utils";
const props = defineProps({ batch: Object });
</script>
