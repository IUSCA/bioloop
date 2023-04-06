<template>
  <h2 class="text-4xl font-bold">Sequencing Runs</h2>

  <div>
    <div class="flex my-2">
      <va-input
        v-model="filterInput"
        class="border-gray-800 border border-solid"
        placeholder="search sequencing runs"
        outline
        clearable
      />
    </div>
    <va-data-table
      :items="batches"
      :columns="columns"
      :hoverable="true"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortingOrder"
      :loading="data_loading"
      :filter="filterInput"
      :row-bind="getRowBind"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/runs/${rowData.id}`" class="va-link">{{
          rowData.name
        }}</router-link>
      </template>
      <template #cell(created_at)="{ value }">
        <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
      </template>
      <template #cell(archived)="{ source }">
        <span v-if="source" class="flex justify-center"
          ><i-mdi-check-circle class="text-green-700"
        /></span>
      </template>
      <template #cell(staged)="{ source }">
        <span v-if="source" class="flex justify-center"
          ><i-mdi-check-circle class="text-green-700"
        /></span>
      </template>
      <template #cell(updated_at)="{ value }">
        <span>{{ moment(value).fromNow() }}</span>
      </template>
      <!-- <template #cell(status)="{ source }">
        <va-progress-circle
          class="mb-2"
          :thickness="0.1"
          :modelValue="source['progress']"
        >
          {{ source["completed"] }} /
          {{ source["steps"] }}
        </va-progress-circle>
      </template> -->
      <template #cell(du_size)="{ source }">
        <span>{{ source != null ? formatBytes(source) : "" }}</span>
      </template>
      <template #cell(workflows)="{ source }">
        <span>{{ source?.length || 0 }}</span>
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
const filterInput = ref("");

const columns = ref([
  // { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "created_at",
    label: "start date",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  {
    key: "archive_path",
    name: "archived",
    label: "archived",
    thAlign: "center",
    tdAlign: "center",
    sortable: true,
  },
  {
    key: "stage_path",
    name: "staged",
    label: "staged",
    thAlign: "center",
    tdAlign: "center",
    sortable: true,
  },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  // { key: "status", sortable: false },
  {
    key: "num_genome_files",
    label: "data files",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  {
    key: "du_size",
    label: "size",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    width: 80,
    sortingFn: (a, b) => a - b,
  },
  {
    key: "workflows",
    tdAlign: "center",
  },
]);

function getRowBind(row) {
  const inprogress_wf = row.workflows?.filter(
    (workflow) => workflow.status == "PROGRESS"
  );
  const is_in_progress = (inprogress_wf?.length || 0) > 0;
  if (is_in_progress) {
    return { class: ["bg-slate-200"] };
  }
}

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
