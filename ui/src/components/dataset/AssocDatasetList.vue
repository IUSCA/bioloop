<template>
  <VaInnerLoading :loading="data_loading">
    <va-data-table
      :items="datasets"
      :columns="columns"
      v-model:sort-by="sort_by"
      v-model:sorting-order="sort_order"
      disable-client-side-sorting
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/datasets/${rowData.id}`" class="va-link">
          {{ rowData.name }}
        </router-link>
      </template>

      <template #cell(du_size)="{ source }">
        <span>{{ source != null ? formatBytes(source) : "" }}</span>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ datetime.date(value) }}</span>
      </template>

      <template #cell(updated_at)="{ value }">
        <span>{{ datetime.date(value) }}</span>
      </template>

      <template #cell(archive_path)="{ value }">
        <span class="flex justify-center">
          <Icon :icon="value ? 'mdi-check' : 'mdi-close'" />
        </span>
      </template>

      <template #cell(is_staged)="{ value }">
        <span class="flex justify-center">
          <Icon :icon="value ? 'mdi-check' : 'mdi-close'" />
        </span>
      </template>
      <template #cell(is_deleted)="{ value }">
        <span class="flex justify-center">
          <Icon :icon="value ? 'mdi-check' : 'mdi-close'" />
        </span>
      </template>
    </va-data-table>
    <!-- pagination -->
    <Pagination
      class="mt-4 px-1 lg:px-3"
      v-model:page="page"
      v-model:page_size="page_size"
      :total_results="total_results"
      :curr_items="datasets.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />
  </VaInnerLoading>
</template>

<script setup>
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";

const props = defineProps({
  dataset_ids: {
    type: Array,
    default: () => [],
  },
});

const datasets = ref([]);
const data_loading = ref(false);

// pagination
const page = ref(1);
const page_size = ref(10);
const total_results = computed(() => props.dataset_ids.length);
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
const offset = computed(() => (page.value - 1) * page_size.value);

// sorting
const sort_by = ref("updated_at");
const sort_order = ref("desc");

const columns = ref([
  // { key: "id", sortable: true,  },
  { key: "name", sortable: true },
  { key: "type", sortable: true },
  {
    key: "du_size",
    label: "size",
    sortable: true,
    width: 80,
  },
  { key: "created_at", label: "created on", sortable: true, width: "100px" },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    width: "100px",
  },
  {
    key: "archive_path",
    label: "archived",
    thAlign: "center",
    tdAlign: "center",
    width: "80px",
  },
  {
    key: "is_staged",
    label: "staged",
    thAlign: "center",
    tdAlign: "center",
    width: "80px",
  },
  {
    key: "is_deleted",
    label: "deleted",
    thAlign: "center",
    tdAlign: "center",
    width: "80px",
  },
]);

watch([() => props.dataset_ids], fetchDatasets, { immediate: true });
watch(page, fetchDatasets);
watch([page_size, sort_by, sort_order], () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    fetchDatasets();
  }
});

function fetchDatasets() {
  if (!props.dataset_ids.length) {
    return;
  }
  data_loading.value = true;
  const ids_to_fetch = props.dataset_ids.slice(
    offset.value,
    offset.value + page_size.value,
  );
  DatasetService.getAll({
    id: ids_to_fetch,
    sort_by: sort_by.value,
    sort_order: sort_order.value,
  })
    .then((res) => {
      datasets.value = res.data.datasets;
    })
    .catch((err) => {
      console.error("Unable to fetch datasets", err);
      toast.error("Unable to fetch datasets");
    })
    .finally(() => {
      data_loading.value = false;
    });
}
</script>
