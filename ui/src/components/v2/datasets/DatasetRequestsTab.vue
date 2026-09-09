<template>
  <div class="flex flex-col gap-3 max-w-7xl mx-auto">
    <!-- Header row -->
    <VaCard class="header card">
      <VaCardContent>
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-2 flex-1">
            <div class="flex items-center justify-between gap-3">
              <!-- subject type selector -->
              <ModernButtonToggle
                v-model="subjectType"
                :options="subjectTypeOptions"
                value-by="value"
              />

              <!-- Search input -->
              <div class="flex-1">
                <Searchbar
                  v-model="subjectSearchTerm"
                  placeholder="Search requests by user or group name"
                />
              </div>
            </div>
          </div>

          <!-- show request button if user cannot review -->
          <VaButton
            v-if="!props.canReview"
            color="success"
            icon="add"
            @click="openRequestAccessModal"
          >
            Request Access
          </VaButton>
        </div>
      </VaCardContent>
    </VaCard>

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
            :show-clear-filters="false"
          />
        </div>

        <div v-else class="space-y-3">
          <AccessRequestCard
            v-for="request in requests"
            :key="request.id"
            :request="request"
            :can-act="props.canReview"
            @review="openReviewModal"
            @view="viewRequest"
          />
        </div>

        <div v-if="error" class="mt-4">
          <ErrorState :message="error" @retry="fetchRequests" />
        </div>
      </VaCardContent>
    </VaCard>

    <ReviewRequestModal
      v-if="reviewingId"
      ref="reviewModal"
      :request-id="reviewingId"
      @reviewed="onReviewed"
    />

    <RequestAccessModal
      ref="requestAccessModalRef"
      :resource="datasetResource"
      @submitted="fetchRequests"
    />
  </div>
</template>

<script setup>
import RequestAccessModal from "@/components/v2/access-requests/RequestAccessModal.vue";
import ReviewRequestModal from "@/components/v2/access-requests/ReviewRequestModal.vue";
import AccessRequestService from "@/services/v2/access-requests";

const props = defineProps({
  dataset: { type: Object, required: true },
  canReview: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const router = useRouter();

const requests = ref([]);
const loading = ref(false);
const error = ref(null);

// The request form addresses the resource, so a dataset is named by its resource_id here
// and not by its own id. The collection tab builds the same shape.
const datasetResource = computed(() => ({
  type: "DATASET",
  id: props.dataset.resource_id,
  dataset: props.dataset,
}));

const requestAccessModalRef = ref(null);
function openRequestAccessModal() {
  requestAccessModalRef.value?.show();
}

async function fetchRequests() {
  loading.value = true;
  error.value = null;

  try {
    let request;
    if (props.canReview) {
      request = AccessRequestService.pendingReview({
        resource_id: props.dataset.resource_id,
      });
    } else {
      request = AccessRequestService.requestedByMe({
        resource_id: props.dataset.resource_id,
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

function viewRequest(request) {
  router.push(`/v2/access-requests/${request.id}`).catch(() => {});
}

const reviewModal = ref(null);
const reviewingId = ref(null);

function openReviewModal(request) {
  reviewingId.value = request.id;
  nextTick(() => reviewModal.value?.show?.());
}

function onReviewed() {
  reviewingId.value = null;
  fetchRequests();
}

onMounted(() => {
  fetchRequests();
});

watch(() => props.dataset?.resource_id, fetchRequests);

// The dataset page calls this when a card elsewhere asks for the request dialog.
defineExpose({ openRequestAccessModal });
</script>
