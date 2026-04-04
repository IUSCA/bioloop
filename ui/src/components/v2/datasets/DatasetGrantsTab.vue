<template>
  <VaCard>
    <VaCardContent>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold">Access Grants</h3>
        <VaButton
          v-if="props.canManageGrants"
          size="small"
          icon="add"
          @click="openIssueGrantModal"
        >
          Issue Grant
        </VaButton>
      </div>

      <div
        v-if="loading"
        class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
      >
        Loading grants...
      </div>

      <div v-else-if="grants.length === 0" class="text-center py-8">
        <EmptyState
          title="No grants"
          message="No active grants for this dataset."
        />
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="grant in grants"
          :key="grant.id"
          class="border-b border-gray-200 dark:border-gray-700 pb-2 last:border-b-0"
        >
          <div class="text-sm font-medium">
            {{ grant.subject?.user?.name || grant.subject?.group?.name }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">
            {{ grant.access_type_id }} • {{ grant.valid_from }} to
            {{ grant.valid_to }}
          </div>
        </div>
      </div>

      <div v-if="error" class="mt-4">
        <ErrorState :message="error" @retry="fetchGrants" />
      </div>
    </VaCardContent>
  </VaCard>

  <IssueGrantModal
    ref="issueGrantModal"
    @update="onGrantCreated"
    :resource="{ id: props.datasetId, type: 'DATASET' }"
  />
</template>

<script setup>
import GrantService from "@/services/v2/grants";

const props = defineProps({
  datasetId: { type: String, required: true },
  canManageGrants: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const grants = ref([]);
const loading = ref(false);
const error = ref(null);
const issueGrantModal = ref(null);

async function fetchGrants() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await GrantService.listGrantsForDataset(props.datasetId);
    grants.value = data || [];
    emit("count-changed", grants.value.length);
  } catch (err) {
    error.value = "Failed to load grants.";
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function openIssueGrantModal() {
  issueGrantModal.value?.show();
}

function onGrantCreated() {
  fetchGrants();
}

onMounted(() => {
  fetchGrants();
});

watch(() => props.datasetId, fetchGrants);
</script>
