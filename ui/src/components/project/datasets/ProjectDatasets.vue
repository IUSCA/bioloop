<template>
  <va-data-table :items="rows" :columns="columns" :loading="data_loading">
    <template #cell(name)="{ rowData }">
      <router-link :to="`/datasets/${rowData.id}`" class="va-link">
        {{ rowData.name }}
      </router-link>
    </template>

    <template #cell(stage)="{ rowData }">
      <div class="">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="cloud_sync"
          @click="handleStage(rowData)"
        />
      </div>
    </template>

    <template #cell(download)="{ rowData }">
      <div class="">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="cloud_download"
          @click="openModalToDownloadProject(rowData)"
        />
      </div>
    </template>

    <template #cell(share)="{ rowData }">
      <div class="">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="share"
          @click="openModalToShareProject(rowData)"
        />
      </div>
    </template>

    <template #cell(num_genome_files)="{ rowData }">
      <maybe :data="rowData?.metadata?.num_genome_files" />
    </template>

    <template #cell(du_size)="{ source }">
      <span>{{ source != null ? formatBytes(source) : "" }}</span>
    </template>

    <template #cell(updated_at)="{ value }">
      <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
    </template>

    <template #cell(assigned_at)="{ value }">
      <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
    </template>
  </va-data-table>
</template>

<script setup>
import moment from "moment";
import { formatBytes } from "@/services/utils";
// import DatasetService from "@/services/dataset";
// import toast from "@/services/toast";

const props = defineProps({
  datasets: {
    type: Array,
    default: () => [],
  },
});

// const data_loading = ref(false);

console.log(props.datasets);

const rows = computed(() => {
  return props.datasets.map((obj) => ({
    ...obj.dataset,
    assigned_at: obj.assigned_at,
  }));
});

const columns = [
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "stage", width: "50px", thAlign: "center", tdAlign: "center" },
  { key: "download", width: "50px", thAlign: "center", tdAlign: "center" },
  { key: "share", width: "50px", thAlign: "center", tdAlign: "center" },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
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
  { key: "assigned_at", sortable: true, label: "assigned on" },
];
</script>
