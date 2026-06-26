<template>
  <VaCard>
    <VaCardContent>
      <div
        v-if="loading"
        class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
      >
        Loading collections...
      </div>

      <div v-else-if="collections.length === 0" class="text-center py-8">
        <EmptyState
          title="Not in any collections"
          message="This dataset is not a member of any collections."
        />
      </div>

      <div v-else>
        <VaDataTable :items="collections" :columns="columns">
          <template #cell(name)="{ row }">
            <RouterLink
              :to="`/v2/collections/${row.rowData.id}`"
              class="text-sm font-medium hover:underline"
              style="color: var(--va-primary)"
            >
              {{ row.rowData.name }}
            </RouterLink>
          </template>

          <template #cell(owner_group)="{ rowData }">
            <span v-if="rowData.owner_group" class="text-sm">{{
              rowData.owner_group.name
            }}</span>
          </template>
        </VaDataTable>
      </div>

      <div v-if="error" class="mt-4">
        <ErrorState :message="error" @retry="fetchCollections" />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import CollectionService from "@/services/v2/collections";

const props = defineProps({
  datasetId: { type: String, required: true },
});

const collections = ref([]);
const loading = ref(false);
const error = ref(null);

const columns = [
  { key: "name", label: "Name" },
  { key: "owner_group", label: "Owner Group", width: "250px" },
];

async function fetchCollections() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await CollectionService.search({
      dataset_id: props.datasetId,
      limit: 100,
    });
    collections.value = data.data || [];
  } catch (err) {
    error.value = "Failed to load collections.";
    console.error(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchCollections();
});

watch(() => props.datasetId, fetchCollections);
</script>
