<template>
  <va-data-table :items="rows" :columns="columns" class="min-h-[100px]">
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
          :color="rowData.is_staging_pending ? 'warning' : 'info'"
          icon="cloud_sync"
          @click="openModalToStageProject(rowData)"
          :disabled="rowData.is_staged || rowData.is_staging_pending"
        />
        <!-- datasetsDetails[rowData.id]?.is_staging_pending -->
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
          :disabled="!rowData.is_staged"
        />
      </div>
    </template>

    <!-- <template #cell(share)="{ rowData }">
      <div class="">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="share"
          @click="openModalToShareProject(rowData)"
        />
      </div>
    </template> -->

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

  <!-- Download Modal -->
  <DatasetDownloadModal
    ref="downloadModal"
    :dataset="datasetToDownload"
    :project-id="props.project.id"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes, cmp } from "@/services/utils";
import wfService from "@/services/workflow";

const props = defineProps({
  datasets: {
    type: Array,
    default: () => [],
  },
  project: {
    type: Object,
  },
});

const rows = computed(() => {
  return props.datasets.map((obj) => ({
    ...obj.dataset,
    assigned_at: obj.assigned_at,
    is_staging_pending: wfService.is_step_pending(
      "STAGE",
      obj.dataset.workflows
    ),
  }));
});

const columns = [
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "stage", width: "70px", thAlign: "center", tdAlign: "center" },
  { key: "download", width: "100px", thAlign: "center", tdAlign: "center" },
  // { key: "share", width: "70px", thAlign: "center", tdAlign: "center" },
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

const downloadModal = ref(null);
const datasetToDownload = ref(null);

function openModalToDownloadProject(dataset) {
  datasetToDownload.value = dataset;
  downloadModal.value.show();
}

function openModalToStageProject(dataset) {
  console.log("openModalToStageProject", dataset);
}
</script>
