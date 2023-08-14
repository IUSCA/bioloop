<template>
  <va-data-table
    :items="rows"
    :columns="columns"
    class="min-h-[100px]"
    :loading="loading"
  >
    <template #cell(name)="{ rowData }">
      <router-link
        :to="{
          path: `/datasets/${rowData.id}`,
          query: { project: props.project.name },
        }"
        class="va-link"
        v-if="auth.canOperate"
      >
        {{ rowData.name }}
      </router-link>
      <span v-else> {{ rowData.name }} </span>
    </template>

    <template #cell(type)="{ value }">
      <DatasetType :type="value" class="" show-icon />
    </template>

    <template #cell(stage)="{ rowData }">
      <!-- dataset is staged -->
      <div v-if="rowData.is_staged">
        <va-button
          class="shadow"
          preset="primary"
          color="info"
          icon="cloud_sync"
          disabled
        />
      </div>
      <div v-else class="flex justify-center">
        <!-- dataset is not staged and a workflow with staging is pending -->
        <half-circle-spinner
          class="flex-none"
          v-if="rowData.is_staging_pending"
          :animation-duration="1000"
          :size="24"
          :color="colors.warning"
        />

        <!-- dataset is not staged and is not being staged -->
        <va-button
          v-else
          class="shadow flex-none"
          preset="primary"
          color="info"
          icon="cloud_sync"
          @click="openModalToStageProject(rowData)"
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

  <!-- Stage Modal -->
  <StageDatasetModal
    ref="stageModal"
    :dataset="datasetToStage"
    @update="fetch_and_update_dataset"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes, cmp } from "@/services/utils";
import wfService from "@/services/workflow";
import DatasetService from "@/services/dataset";
import config from "@/config";
import { HalfCircleSpinner } from "epic-spinners";
import { useColors } from "vuestic-ui";
import { useAuthStore } from "@/stores/auth";

const { colors } = useColors();
const auth = useAuthStore();

const props = defineProps({
  datasets: {
    type: Array,
    default: () => [],
  },
  project: {
    type: Object,
  },
});

const loading = ref(false);
const _datasets = ref({});

watch(
  () => props.project.name,
  () => {
    console.log(`project name is : ${props.project.name}`);
  }
);

// populate _datasets from props
watch(
  () => props.datasets,
  () => {
    _datasets.value = props.datasets.reduce((acc, obj) => {
      acc[obj.dataset.id] = obj.dataset;
      return acc;
    }, {});
    // console.log("_datasets from props", _datasets.value);
  },
  {
    immediate: true,
  }
);

const rows = computed(() => {
  return Object.values(_datasets.value).map((ds) => ({
    ...ds,
    is_staging_pending: wfService.is_step_pending("VALIDATE", ds.workflows),
  }));
});

const tracking = computed(() => {
  const t = rows.value.filter((ds) => ds.is_staging_pending).map((ds) => ds.id);
  // console.log("tracking", t);
  return t;
});

function fetch_and_update_dataset(id) {
  // console.log("fetch_and_update_dataset", id);
  DatasetService.getById({ id })
    .then((res) => {
      _datasets.value[id] = res.data;
    })
    .catch((err) => {
      console.error("unable to fetch dataset", id, err);
    });
}

function poll_datasets() {
  tracking.value.forEach(fetch_and_update_dataset);
}

const poll = useIntervalFn(
  () => {
    // console.log("polling", tracking.value, _datasets.value);
    poll_datasets();
  },
  config.dataset_polling_interval,
  {
    immediate: false,
  }
);

watch(tracking, () => {
  // console.log("watch tracking", tracking.value.length);
  if (tracking.value.length > 0) {
    // start poll
    poll.resume();
  } else {
    // stop poll
    poll.pause();
  }
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

// download modal
const downloadModal = ref(null);
const datasetToDownload = ref(null);

function openModalToDownloadProject(dataset) {
  datasetToDownload.value = dataset;
  downloadModal.value.show();
}

// stage modal
const stageModal = ref(null);
const datasetToStage = ref({});

function openModalToStageProject(dataset) {
  // console.log("openModalToStageProject", dataset);
  datasetToStage.value = dataset;
  stageModal.value.show();
}
</script>
