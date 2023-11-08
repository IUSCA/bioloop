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

    <!-- filter -->
    <!--    <div class="flex-none flex items-center justify-center">-->
    <!--      <filters-group @update="updateFiltersGroupQuery"></filters-group>-->
    <!--    </div>-->

    <!-- create button -->
    <div class="flex-none">
      <va-button
        icon="add"
        class="px-1"
        color="success"
        @click="router.push('/dataProductUploads/new')"
      >
        Create Data Product
      </va-button>
    </div>
  </div>

  <!-- table -->
  <va-data-table :items="pastUploads" :columns="columns">
    <template #cell(status)="{ value }">
      <va-chip outline :color="getStatusChipColor(value)">
        {{ value }}
      </va-chip>
    </template>

    <template #cell(dataset_id)="{ rowData }">
      <span v-if="!rowData.dataset_id" class="va-text-secondary">
        {{ rowData.dataset_name }}
      </span>
      <router-link v-else :to="`/datasets/${rowData.id}`" class="va-link">{{
        rowData.dataset_name
      }}</router-link>
    </template>

    <template #cell(source_dataset_id)="{ rowData }">
      <router-link
        :to="`/datasets/${rowData.source_dataset_id}`"
        class="va-link"
        >{{ rowData.source_dataset.name }}</router-link
      >
    </template>

    <template #cell(user_id)="{ rowData }">
      <span>{{ rowData.user.name }}</span>
    </template>
  </va-data-table>
</template>

<script setup>
import config from "@/config";
import datasetService from "@/services/dataset";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
const router = useRouter();

nav.setNavItems([{ label: "Data Product Uploads" }]);

const filterInput = ref("");
const pastUploads = ref([]);

const columns = [
  {
    key: "status",
  },
  { key: "dataset_id", label: "Dataset" },
  { key: "source_dataset_id", label: "Source Dataset" },
  { key: "user_id", label: "Uploaded By" },
];

const getStatusChipColor = (value) => {
  console.log(value);
  let color;
  switch (value) {
    case config.upload_status.PROCESSING:
      color = "primary";
      break;
    case config.upload_status.COMPLETE:
      color = "success";
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
  datasetService.getDataProductUploads().then((res) => {
    pastUploads.value = res.data;
  });
});
</script>
