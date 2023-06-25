<template>
  <va-data-table :items="rows" :columns="columns">
    <template #cell(name)="{ rowData }">
      <router-link :to="`/datasets/${rowData.id}`" class="va-link">
        {{ rowData.name }}
      </router-link>
    </template>

    <template #cell(type)="{ value }">
      <DatasetType :type="value" class="" show-icon />
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

    <template #cell(metadata)="{ rowData }">
      <maybe :data="rowData?.metadata?.num_genome_files" />
    </template>

    <template #cell(du_size)="{ source }">
      <span>{{ source != null ? formatBytes(source) : "" }}</span>
    </template>

    <template #cell(updated_at)="{ value }">
      <span>{{ datetime.date(value) }}</span>
    </template>
  </va-data-table>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes, cmp } from "@/services/utils";

// import toast from "@/services/toast";

const props = defineProps({
  datasets: {
    type: Array,
    default: () => [],
  },
});

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
  { key: "type", sortable: true },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
  },
  {
    key: "metadata",
    label: "data files",
    sortable: true,

    sortingFn: (a, b) => cmp(a?.num_genome_files, b?.num_genome_files),
  },
  {
    key: "du_size",
    label: "size",
    sortable: true,

    sortingFn: (a, b) => a - b,
  },
];
</script>
