<template>
  <VaCard>
    <VaCardContent>
      <div class="min-h-[350px]">
        <!-- Header -->
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-lg font-semibold tracking-tight">
            {{ headerTitle }}
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ headerSubtitle }}
          </p>
        </div>

        <!-- content -->
        <div>
          <!-- loading state -->
          <div v-if="loading"></div>

          <!-- error state -->
          <div v-else-if="error" class="py-12 px-6">
            <ErrorState
              title="Failed to load access requests"
              :message="error?.message"
              @retry="fetchRequests"
            />
          </div>

          <!-- data state -->
          <div v-else-if="requests?.length">
            <TransitionGroup name="list" tag="div" class="space-y-4">
              <AccessRequestCard
                v-for="request in requests"
                :key="request.id"
                :request="request"
                :can-review="props.canReview"
              />
            </TransitionGroup>
          </div>

          <!-- no data -->
          <div
            v-else
            class="flex flex-col items-center justify-center gap-5 py-12 px-6"
          >
            <!-- Icon -->
            <div class="flex items-center justify-center">
              <i-mdi-account-question-outline
                class="text-5xl text-gray-400 dark:text-gray-500"
              />
            </div>

            <!-- Content -->
            <div
              class="text-center max-w-md space-y-2 text-gray-900 dark:text-gray-100"
            >
              <h3 class="font-semibold tracking-tight">{{ noDataTitle }}</h3>
              <p class="text-sm leading-relaxed va-text-secondary">
                {{ noDataMessage }}
              </p>
            </div>

            <!-- Call to action -->
            <VaButton
              v-if="!props.canReview"
              color="primary"
              @click="openRequestModal"
            >
              <div class="flex items-center gap-3 px-2">
                <i-mdi-account-question-outline class="text-lg" />
                <span class="font-medium">Request access</span>
              </div>
            </VaButton>
          </div>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import AccessRequestService from "@/services/v2/access-requests";

const props = defineProps({
  collectionId: { type: String, required: false },
  canReview: { type: Boolean, default: false },
});
// const emit = defineEmits(["count-changed"]);

const requests = ref([]);
const loading = ref(true);
const error = ref(null);

const page = ref(1);
const pageSize = ref(10);
const totalRequests = ref(0);
// const ITEMS_PER_PAGE = 10;

const headerTitle = computed(() =>
  props.canReview ? "Pending Review" : "Your Requests",
);
const headerSubtitle = computed(() =>
  props.canReview
    ? "Review and manage access requests for this collection."
    : "View and manage the access requests you've submitted for this collection.",
);

const noDataTitle = computed(() =>
  props.canReview
    ? "No pending access requests to review"
    : "No access requests",
);
const noDataMessage = computed(() =>
  props.canReview
    ? "There are no pending access requests for this collection."
    : "You haven't requested access to this collection yet.",
);

function fetchRequests() {
  if (!props.collectionId) return;

  loading.value = true;
  error.value = null;

  let promise = null;
  if (props.canReview) {
    promise = AccessRequestService.pendingReview({
      resource_id: props.collectionId,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    });
  } else {
    promise = AccessRequestService.requestedByMe({
      resource_id: props.collectionId,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    });
  }

  promise
    .then((response) => {
      requests.value = response.data.data;
      totalRequests.value = response.data.metadata.total;
    })
    .catch((err) => {
      error.value =
        err?.response?.data?.message ?? "Failed to load access requests.";
      console.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
}

function openRequestModal() {
  // TODO: open modal to request access
}

onMounted(() => {
  fetchRequests();
});
</script>
