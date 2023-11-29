<template>
  <!-- search bar and filter -->
  <div class="flex mb-3 gap-3">
    <!-- search bar -->
    <div class="flex-1">
      <va-input
        v-model="filterInput"
        class="w-full"
        placeholder="Type / to search Data Product Uploads"
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
        @click="router.push('/dataProductUploads/new')"
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

    <template #cell(data_product_name)="{ rowData }">
      <span
        v-if="rowData.status !== config.upload_status.COMPLETE"
        class="va-text-secondary"
      >
        {{ rowData.data_product_name }}
      </span>
      <router-link
        v-else
        :to="`/datasets/${rowData.dataset_id}`"
        class="va-link"
        >{{ rowData.data_product_name }}</router-link
      >
    </template>

    <template #cell(source_dataset_name)="{ rowData }">
      <router-link
        :to="`/datasets/${rowData.source_dataset_id}`"
        class="va-link"
        >{{ rowData.source_dataset_name }}</router-link
      >
    </template>

    <template #cell(file_type_name)="{ value }">
      <va-chip outline size="small">
        {{ value }}
      </va-chip>
    </template>

    <template #cell(user_name)="{ value }">
      <span>{{ value }}</span>
    </template>

    <template #cell(actions)="{ row, isExpanded }">
      <VaButton
        :icon="isExpanded ? 'va-arrow-up' : 'va-arrow-down'"
        preset="secondary"
        class="w-full"
        @click="row.toggleRowDetails()"
      >
        {{ isExpanded ? "Hide" : "More info" }}
      </VaButton>
    </template>

    <template #expandableRow="{ rowData }">
      <va-card>
        <va-card-title>Files</va-card-title>
        <va-card-content>
          <va-data-table :items="rowData.files" :columns="fileColumns">
            <template #cell(status)="{ value }">
              <va-chip size="small" :color="getStatusChipColor(value)">
                {{ value }}
              </va-chip>
            </template>
          </va-data-table>
        </va-card-content>
      </va-card>
    </template>
  </va-data-table>
</template>

<script setup>
import config from "@/config";
import datasetService from "@/services/dataset";
import { useNavStore } from "@/stores/nav";
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";

const nav = useNavStore();
const router = useRouter();

nav.setNavItems([{ label: "Data Product Uploads" }]);
useSearchKeyShortcut();

const filterInput = ref("");
const pastUploads = ref([]);

const uploads = computed(() => {
  return pastUploads.value.map((e) => {
    const sourceDataset = e.dataset.source_datasets[0];
    return {
      ...e,
      data_product_name: e.dataset.name,
      source_dataset_name: sourceDataset.source_dataset.name,
      source_dataset_id: sourceDataset.source_dataset.id,
      file_type_name: e.dataset.file_type.name,
      user_name: e.user.name,
    };
  });
});

const columns = [
  { key: "status", sortable: true },
  { key: "data_product_name", label: "Data Product", sortable: true },
  { key: "source_dataset_name", label: "Source Dataset", sortable: true },
  { key: "file_type_name", label: "File Type", sortable: true },
  { key: "user_name", label: "Uploaded By", sortable: true },
  { key: "actions", width: "120px" },
];

const fileColumns = [
  { key: "name", sortable: true, width: "50%" },
  { key: "status", sortable: true, width: "50%" },
];

const getStatusChipColor = (value) => {
  let color;
  switch (value) {
    case config.upload_status.UPLOADING:
      color = "primary";
      break;
    case config.upload_status.UPLOAD_FAILED:
      color = "warning";
      break;
    case config.upload_status.UPLOADED:
      color = "success";
      break;
    case config.upload_status.PROCESSING:
      color = "primary";
      break;
    case config.upload_status.COMPLETE:
      color = "success";
      break;
    case config.upload_status.VALIDATION_FAILED:
      color = "danger";
      break;
    case config.upload_status.FAILED:
      color = "danger";
      break;
    default:
      console.log("received unexpected value for Upload Status");
  }
  return color;
};

onMounted(() => {
  datasetService.getUploadLogs().then((res) => {
    pastUploads.value = res.data;
  });
});

watch(filterInput, () => {
  const filters = filterInput.value && {
    dataset_name: filterInput.value,
  };
  datasetService.getUploadLogs(filters).then((res) => {
    pastUploads.value = res.data;
  });
});
</script>

<route lang="yaml">
meta:
  title: Data Product Uploads
  requiresRoles: ["operator", "admin"]
</route>
