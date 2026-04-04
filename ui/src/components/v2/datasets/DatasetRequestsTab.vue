<template>
  <VaCard>
    <VaCardContent>
      <div
        v-if="loading"
        class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
      >
        Loading requests...
      </div>

      <div v-else-if="requests.length === 0" class="text-center py-8">
        <EmptyState
          :title="props.canReview ? 'No pending requests' : 'No requests yet'"
          :message="
            props.canReview
              ? 'All requests have been reviewed.'
              : 'You have not made any access requests for this dataset.'
          "
        />
      </div>

      <div v-else class="space-y-3">
        <AccessRequestCard
          v-for="request in requests"
          :key="request.id"
          :request="request"
          :can-review="props.canReview"
          @updated="fetchRequests"
        />
      </div>

      <div v-if="error" class="mt-4">
        <ErrorState :message="error" @retry="fetchRequests" />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import AccessRequestService from "@/services/v2/access-requests";

const props = defineProps({
  datasetId: { type: String, required: true },
  canReview: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const requests = ref([]);
const loading = ref(false);
const error = ref(null);

async function fetchRequests() {
  loading.value = true;
  error.value = null;

  try {
    let request;
    if (props.canReview) {
      request = AccessRequestService.pendingReview({
        resource_id: props.datasetId,
      });
    } else {
      request = AccessRequestService.requestedByMe({
        resource_id: props.datasetId,
      });
    }

    const { data } = await request;
    requests.value = data.data || [];
    emit("count-changed", requests.value.length);
  } catch (err) {
    error.value = "Failed to load requests.";
    console.error(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchRequests();
});

watch(() => props.datasetId, fetchRequests);
</script>
