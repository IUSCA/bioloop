<template>
  <va-data-table :items="datasets" :columns="columns" :loading="data_loading">
    <template #cell(name)="{ rowData }">
      <router-link :to="`/datasets/${rowData.id}`" class="va-link">
        {{ rowData.name }}
      </router-link>
    </template>

    <template #cell(num_genome_files)="{ rowData }">
      <Maybe :data="rowData?.metadata?.num_genome_files" />
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
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { formatBytes, isFeatureEnabled } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  dataset_ids: {
    type: Array,
    default: () => [],
  },
});

const auth = useAuthStore();

const datasets = ref([]);
const data_loading = ref(false);

const columns = ref([
  // { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  ...(isFeatureEnabled({
    featureKey: "genomeBrowser",
    hasRole: auth.hasRole,
  })
    ? [
        {
          key: "num_genome_files",
          label: "data files",
          sortable: true,
          sortingOptions: ["desc", "asc", null],
        },
      ]
    : []),
  {
    key: "du_size",
    label: "size",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    width: 80,
    sortingFn: (a, b) => a - b,
  },
]);

watch(
  [() => props.dataset_ids],
  () => {
    data_loading.value = true;
    Promise.all(
      props.dataset_ids.map((id) =>
        DatasetService.getById({ id }).then((res) => res.data),
      ),
    )
      .then((_datasets) => {
        datasets.value = _datasets;
      })
      .catch((err) => {
        console.error("Unable to fetch datasets", err);
        toast.error("Unable to fetch datasets");
      })
      .finally(() => {
        data_loading.value = false;
      });
  },
  { immediate: true },
);
</script>
