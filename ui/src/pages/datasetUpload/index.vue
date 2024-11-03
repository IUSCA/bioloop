<template>
  <div class="flex mb-3 gap-3">
    <!-- search bar -->
    <div class="flex-1">
      <va-input
        v-model="filterInput"
        class="w-full"
        placeholder="Type / to search Dataset Uploads"
        outline
        clearable
        input-class="search-input"
      >
        <template #prependInner>
          <Icon icon="material-symbols:search" class="text-xl" />
        </template>
      </va-input>
    </div>

    <!-- create button -->
    <div class="flex-none">
      <va-button
        icon="add"
        class="px-1"
        color="success"
        @click="router.push('/datasetUpload/new')"
      >
        Upload Data Product
      </va-button>
    </div>
  </div>

  <!-- table -->
  <va-data-table :items="uploads" :columns="columns">
    <template #cell(status)="{ value }">
      <va-chip size="small" :color="getStatusChipColor(value)">
        {{ value }}
      </va-chip>
    </template>

    <template #cell(uploaded_dataset)="{ rowData }">
      <router-link :to="`/datasets/${rowData.dataset.id}`" class="va-link">{{
        rowData.dataset.name
      }}</router-link>
    </template>

    <template #cell(source_dataset)="{ rowData }">
      <router-link
        v-if="rowData.source_dataset"
        :to="`/datasets/${rowData.source_dataset.id}`"
        class="va-link"
      >
        {{ rowData.source_dataset.name }}
      </router-link>
    </template>

    <template #cell(user)="{ rowData }">
      <span>{{ rowData.user.name }} ({{ rowData.user.username }})</span>
    </template>
  </va-data-table>
</template>

<script setup>
import config from "@/config";
import uploadService from "@/services/upload";
import { useNavStore } from "@/stores/nav";
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";

const nav = useNavStore();
const router = useRouter();

nav.setNavItems([{ label: "Dataset Uploads" }]);
useSearchKeyShortcut();

const filterInput = ref("");
const pastUploads = ref([]);

const uploads = computed(() => {
  console.log("computed uploads");
  // console.dir(pastUploads.value, { depth: null });
  return pastUploads.value.map((e) => {
    const dataset_upload_log = e.dataset_upload_log;
    const dataset = dataset_upload_log.dataset;
    const source_dataset =
      dataset.source_datasets.length > 0
        ? dataset.source_datasets[0].source_dataset
        : null;
    return {
      ...e,
      user: e.user,
      source_dataset,
      uploaded_dataset: dataset,
    };
  });
});

const columns = [
  { key: "status", width: "5%" },
  {
    key: "uploaded_dataset",
    label: "Uploaded Data Product",
    width: "30%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "source_dataset",
    label: "Source Dataset",
    width: "30%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "user",
    label: "Uploaded By",
    width: "25%",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const getStatusChipColor = (value) => {
  let color;
  switch (value) {
    case config.upload.status.UPLOADING:
    case config.upload.status.UPLOADED:
    case config.upload.status.PROCESSING:
      color = "primary";
      break;
    case config.upload.status.UPLOAD_FAILED:
      color = "warning";
      break;
    case config.upload.status.COMPLETE:
      color = "success";
      break;
    case config.upload.status.PROCESSING_FAILED:
    case config.upload.status.FAILED:
      color = "danger";
      break;
    default:
      console.log("received unexpected value for Upload Status");
  }
  return color;
};

onMounted(() => {
  uploadService
    .getUploadLogs({
      upload_type: config.upload.type.DATASET,
    })
    .then((res) => {
      pastUploads.value = res.data;
    });
});

watch(filterInput, () => {
  const filters = filterInput.value && {
    entity_name: filterInput.value,
    upload_type: config.upload.type.DATASET,
  };
  uploadService.getUploadLogs(filters).then((res) => {
    pastUploads.value = res.data;
  });
});
</script>

<route lang="yaml">
meta:
  title: Dataset Uploads
  requiresRoles: ["operator", "admin"]
</route>
