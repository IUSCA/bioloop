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
            {{ moment(props.batch.created_at).format("YYYY-MM-DD HH:mm:ss") }}
            UTC
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span>{{ moment(props.batch.updated_at).fromNow() }}</span>
            <span class="text-sm pl-3"
              >{{
                moment(props.batch.updated_at).format("YYYY-MM-DD HH:mm:ss")
              }}
              UTC</span
            >
          </td>
        </tr>
        <tr>
          <td>Source Path</td>
          <td>{{ props.batch.origin_path }}</td>
        </tr>
        <tr>
          <td>Total Size</td>
          <td>{{ formatBytes(props.batch.du_size) }}</td>
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
import moment from "moment";
import { formatBytes } from "../../services/utils";
const props = defineProps({ batch: Object });
</script>
