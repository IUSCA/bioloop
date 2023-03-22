<template>
  <h2 class="text-4xl font-bold">Sequencing Runs</h2>

  <div>
    <va-data-table
      :items="row_items"
      :columns="columns"
      :hoverable="true"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortingOrder"
      :loading="data_loading"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/runs/${rowData.id}`" class="va-link">{{
          rowData.name
        }}</router-link>
      </template>
      <template #cell(start_date)="{ value }">
        <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
      </template>
      <template #cell(last_updated)="{ value }">
        <span>{{ moment(value).fromNow() }}</span>
      </template>
      <template #cell(status)="{ source }">
        <va-progress-circle
          class="mb-2"
          :thickness="0.1"
          :modelValue="source['progress']"
        >
          {{ source["completed"] }} /
          {{ source["steps"] }}
        </va-progress-circle>
      </template>
    </va-data-table>
  </div>
</template>

<script setup>
import moment from "moment";
import BatchService from "../../services/batch";
import { formatBytes } from "../../services/utils";
import toast from "@/services/toast";

const batches = ref([]);
const data_loading = ref(false);

const row_items = computed(() => {
  return batches.value.map((p) => {
    const workflow = p["workflow"] || {};
    return {
      id: p["id"],
      name: p["name"],
      start_date: p["created_at"],
      last_updated: p["updated_at"],
      data_files: p["num_genome_files"],
      size: p["du_size"] == null ? "" : formatBytes(p["du_size"]),
      status: {
        progress: (100 * workflow["steps_done"]) / workflow["total_steps"],
        steps: workflow["total_steps"],
        completed: workflow["steps_done"],
      },
    };
  });
});

const columns = ref([
  // { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "start_date",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  {
    key: "last_updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  { key: "status", sortable: false },
  { key: "data_files", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "size",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    width: 80,
  },
]);

// initial sorting order
const sortBy = ref("start_date");
const sortingOrder = ref("desc");

function fetch_all_batches() {
  data_loading.value = true;
  BatchService.getAll()
    .then((res) => (batches.value = res))
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch sequencing runs");
    })
    .finally(() => {
      data_loading.value = false;
    });
}
fetch_all_batches();
</script>

<route lang="yaml">
meta:
  title: Sequencing Runs
</route>
