<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>SDA</td>
          <td>{{ formatBytes(storage.sda) }}</td>
        </tr>
        <tr>
          <td>Slate Scratch</td>
          <td>{{ formatBytes(storage.slate_scratch) }}</td>
        </tr>
        <tr>
          <td>Project Space</td>
          <td>{{ formatBytes(storage.slate_project) }}</td>
        </tr>
        <tr>
          <td>Sequencing Runs</td>
          <td>{{ formatBytes(storage.sequencing_runs) }}</td>
        </tr>
        <tr>
          <td>Data Products</td>
          <td>{{ formatBytes(storage.data_products) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { formatBytes } from "@/services/utils";
const storage = ref({
  sda: 1000000000000,
  slate_scratch: 10000000000,
  slate_project: 5050510000,
  sequencing_runs: 10000,
  data_products: 10000,
});
// const stats = ref({
//   sequencing_runs: 100,
//   data_products: 100,
// });
</script>
