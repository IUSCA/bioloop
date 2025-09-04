<template>
  <div>
    <!-- table -->
    <div class="overflow-x-auto">
      <va-data-table
        :items="derivedDatasets"
        :columns="columns"
        v-model:sort-by="query.sort_by"
        v-model:sorting-order="query.sort_order"
        disable-client-side-sorting
        hoverable
        :loading="loading"
      >
        <template #cell(name)="{ rowData }">
          <router-link :to="`/datasets/${rowData.dataset.id}`" class="va-link">
            {{ rowData.dataset.name }}
          </router-link>
        </template>

        <template #cell(type)="{ rowData }">
          <DatasetType :type="rowData.dataset.type" />
        </template>

        <template #cell(size)="{ rowData }">
          <span v-if="rowData.dataset.du_size">
            {{ formatBytes(rowData.dataset.du_size) }}
          </span>
        </template>

        <template #cell(files)="{ rowData }">
          <span v-if="rowData.dataset.num_files != null">
            {{ rowData.dataset.num_files }}
          </span>
        </template>

        <template #cell(created_at)="{ rowData }">
          <span>{{ datetime.date(rowData.created_at) }}</span>
        </template>
      </va-data-table>
    </div>

    <!-- pagination -->
    <Pagination
      class="mt-4 px-1 lg:px-3"
      v-model:page="query.page"
      v-model:page_size="query.page_size"
      :total_results="total_results"
      :curr_items="derivedDatasets.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />
  </div>
</template>

<script setup>
import DatasetType from "@/components/dataset/DatasetType.vue";
import Pagination from "@/components/utils/Pagination.vue";
import ConversionService from "@/services/conversions";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import { computed, ref, watch } from 'vue';

const props = defineProps({ 
  conversionId: {
    type: [Number],
    required: true
  }
});

const derivedDatasets = ref([]);
const loading = ref(false);
const total_results = ref(0);

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const query = ref({
  page: 1,
  page_size: 25,
  sort_by: 'created_at',
  sort_order: 'desc',
});

const columns = [
  {
    key: 'name',
    label: 'Dataset Name',
    sortable: true,
    thAlign: 'left',
    tdAlign: 'left',
  },
  {
    key: 'type',
    label: 'Type',
    sortable: true,
    thAlign: 'left',
    tdAlign: 'left',
  },
  {
    key: 'size',
    label: 'Size',
    sortable: true,
    thAlign: 'right',
    tdAlign: 'right',
  },
  {
    key: 'files',
    label: 'Files',
    sortable: true,
    thAlign: 'right',
    tdAlign: 'right',
  },
  {
    key: 'created_at',
    label: 'Created',
    sortable: true,
    thAlign: 'left',
    tdAlign: 'left',
  },
];

const fetchParams = computed(() => {
  const offset = (query.value.page - 1) * query.value.page_size;
  return {
    limit: query.value.page_size,
    offset,
    sort_by: query.value.sort_by,
    sort_order: query.value.sort_order,
  };
});

async function fetchDerivedDatasets() {
  if (!props.conversionId) return;
  
  loading.value = true;
  try {
    const response = await ConversionService.getDerivedDatasets(props.conversionId, fetchParams.value);
    derivedDatasets.value = response.data.derived_datasets || [];
    total_results.value = response.data.metadata.count || 0;
  } catch (error) {
    toast.error('Error fetching derived datasets:', error);
    derivedDatasets.value = [];
    total_results.value = 0;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [query.value.page, query.value.page_size, query.value.sort_by, query.value.sort_order],
  () => {
    fetchDerivedDatasets();
  },
  { immediate: true }
);

watch(
  () => props.conversionId,
  () => {
    query.value.page = 1; // Reset to first page
    fetchDerivedDatasets();
  },
  { immediate: true }
);
</script>
