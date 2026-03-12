<template>
  <div class="flex flex-col gap-6">
    <!-- Datasets section -->
    <div>
      <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
        Datasets
      </h2>

      <VaSkeleton v-if="datasetsLoading" variant="rounded" height="160px" />

      <div
        v-else-if="datasets.length === 0"
        class="flex flex-col items-center py-8 gap-2 text-center"
      >
        <i-mdi-database-outline
          class="text-4xl text-gray-300 dark:text-gray-600"
        />
        <p class="text-sm" style="color: var(--va-secondary)">
          No datasets owned by this group.
        </p>
      </div>

      <VaDataTable
        v-else
        :items="datasets"
        :columns="datasetColumns"
        hoverable
        striped
      >
        <template #cell(name)="{ row }">
          <RouterLink
            :to="`/v2/datasets/${row.rowData.id}`"
            class="text-sm font-medium hover:underline"
            style="color: var(--va-primary)"
          >
            {{ row.rowData.name }}
          </RouterLink>
        </template>
        <template #cell(type)="{ row }">
          <VaChip v-if="row.rowData.type" color="info" size="small">{{
            row.rowData.type
          }}</VaChip>
          <span v-else class="text-sm text-gray-400">—</span>
        </template>
        <template #cell(status)="{ row }">
          <VaChip
            :color="row.rowData.is_deleted ? 'secondary' : 'success'"
            size="small"
          >
            {{ row.rowData.is_deleted ? "Archived" : "Active" }}
          </VaChip>
        </template>
      </VaDataTable>
    </div>

    <VaDivider />

    <!-- Collections section -->
    <div>
      <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
        Collections
      </h2>

      <VaSkeleton v-if="collectionsLoading" variant="rounded" height="160px" />

      <div
        v-else-if="collections.length === 0"
        class="flex flex-col items-center py-8 gap-2 text-center"
      >
        <i-mdi-folder-multiple-outline
          class="text-4xl text-gray-300 dark:text-gray-600"
        />
        <p class="text-sm" style="color: var(--va-secondary)">
          No collections owned by this group.
        </p>
      </div>

      <VaDataTable
        v-else
        :items="collections"
        :columns="collectionColumns"
        hoverable
        striped
      >
        <template #cell(name)="{ row }">
          <RouterLink
            :to="`/v2/collections/${row.rowData.id}`"
            class="text-sm font-medium hover:underline"
            style="color: var(--va-primary)"
          >
            {{ row.rowData.name }}
          </RouterLink>
        </template>
        <template #cell(status)="{ row }">
          <VaChip
            :color="row.rowData.is_archived ? 'secondary' : 'success'"
            size="small"
          >
            {{ row.rowData.is_archived ? "Archived" : "Active" }}
          </VaChip>
        </template>
      </VaDataTable>
    </div>
  </div>
</template>

<script setup>
import GroupService from "@/services/v2/groups";

const props = defineProps({
  groupId: { type: String, required: true },
});

const emit = defineEmits(["count-changed"]);

const datasets = ref([]);
const datasetsLoading = ref(false);
const datasetsTotal = ref(0);

const collections = ref([]);
const collectionsLoading = ref(false);
const collectionsTotal = ref(0);

const datasetColumns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
];

const collectionColumns = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status" },
];

async function fetchDatasets() {
  datasetsLoading.value = true;
  try {
    const { data } = await GroupService.getDatasets(props.groupId);
    datasets.value = data.data;
    datasetsTotal.value = data.metadata?.total ?? data.data.length;
  } catch {
    datasets.value = [];
    datasetsTotal.value = 0;
  } finally {
    datasetsLoading.value = false;
    emitCount();
  }
}

async function fetchCollections() {
  collectionsLoading.value = true;
  try {
    const { data } = await GroupService.getCollections(props.groupId);
    collections.value = data.data;
    collectionsTotal.value = data.metadata?.total ?? data.data.length;
  } catch {
    collections.value = [];
    collectionsTotal.value = 0;
  } finally {
    collectionsLoading.value = false;
    emitCount();
  }
}

function emitCount() {
  // only emit once both are done loading
  if (!datasetsLoading.value && !collectionsLoading.value) {
    emit("count-changed", datasetsTotal.value + collectionsTotal.value);
  }
}

onMounted(() => {
  fetchDatasets();
  fetchCollections();
});
</script>
