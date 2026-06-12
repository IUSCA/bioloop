<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="text-xl font-semibold">Access Requests</h1>
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Review and manage access requests you are responsible for.
      </p>
    </div>

    <VaTabs
      v-model="activeTab"
      class="border-b border-solid border-blue-500/50"
    >
      <template #tabs>
        <VaTab name="pending">
          <span class="flex items-center gap-1.5">
            Pending review
            <span v-if="pendingTotal !== null" class="tab-count-badge">
              {{ pendingTotal }}
            </span>
          </span>
        </VaTab>

        <VaTab name="reviewed">
          <span class="flex items-center gap-1.5">
            Reviewed
            <span v-if="reviewedTotal !== null" class="tab-count-badge">
              {{ reviewedTotal }}
            </span>
          </span>
        </VaTab>
      </template>
    </VaTabs>

    <!-- Pending -->
    <div v-if="activeTab === 'pending'">
      <Transition name="fade-slide" mode="out-in">
        <div v-if="pendingError" key="error" class="py-12 px-6">
          <ErrorState
            title="Failed to load pending requests"
            :message="pendingError?.message"
            @retry="fetchPendingRequests"
          />
        </div>

        <div
          v-else-if="!pendingLoading && pendingRequests.length === 0"
          key="empty"
          class="py-12 px-6"
        >
          <EmptyState
            title="No access requests pending review"
            message="Requests that need your review will appear here."
            @reset="fetchPendingRequests"
          />
        </div>

        <div v-else key="list">
          <div class="space-y-4">
            <AccessRequestCard
              v-for="req in pendingRequests"
              :key="req.id"
              :request="req"
              :can-act="true"
              @approve="openReviewModal(req, 'approve')"
              @reject="openReviewModal(req, 'reject')"
              @view="viewRequest"
            />
          </div>

          <Pagination
            class="mt-5 px-5"
            v-model:page="pendingPage"
            v-model:page_size="itemsPerPage"
            :total_results="pendingTotal"
            :curr_items="pendingRequests.length"
          />
        </div>
      </Transition>
    </div>

    <!-- Reviewed -->
    <div v-else>
      <Transition name="fade-slide" mode="out-in">
        <div v-if="reviewedError" key="error" class="py-12 px-6">
          <ErrorState
            title="Failed to load reviewed requests"
            :message="reviewedError?.message"
            @retry="fetchReviewedRequests"
          />
        </div>

        <div
          v-else-if="!reviewedLoading && reviewedRequests.length === 0"
          key="empty"
          class="py-12 px-6"
        >
          <EmptyState
            title="No reviewed access requests"
            message="Requests you reviewed will appear here."
            @reset="fetchReviewedRequests"
          />
        </div>

        <div v-else key="list">
          <div class="space-y-4">
            <AccessRequestCard
              v-for="req in reviewedRequests"
              :key="req.id"
              :request="req"
              :can-act="false"
              @view="viewRequest"
            />
          </div>

          <Pagination
            class="mt-5 px-5"
            v-model:page="reviewedPage"
            v-model:page_size="itemsPerPage"
            :total_results="reviewedTotal"
            :curr_items="reviewedRequests.length"
          />
        </div>
      </Transition>
    </div>

    <AccessRequestReviewModal ref="reviewModal" @update="refreshAll" />
  </div>
</template>

<script setup>
import AccessRequestCard from "@/components/v2/access-requests/AccessRequestCard.vue";
import AccessRequestReviewModal from "@/components/v2/access-requests/AccessRequestReviewModal.vue";
import AccessRequestService from "@/services/v2/access-requests";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
const router = useRouter();

const activeTab = ref("pending");
const itemsPerPage = ref(10);

const pendingRequests = ref([]);
const pendingTotal = ref(null);
const pendingPage = ref(1);
const pendingLoading = ref(true);
const pendingError = ref(null);

const reviewedRequests = ref([]);
const reviewedTotal = ref(null);
const reviewedPage = ref(1);
const reviewedLoading = ref(true);
const reviewedError = ref(null);

const reviewModal = ref(null);

function setNav() {
  nav.setNavItems([{ label: "Access Requests" }]);
}

async function fetchPendingRequests() {
  pendingLoading.value = true;
  pendingError.value = null;
  try {
    const offset = (pendingPage.value - 1) * itemsPerPage.value;
    const res = await AccessRequestService.pendingReview({
      offset,
      limit: itemsPerPage.value,
      sort_by: "created_at",
      sort_order: "desc",
    });
    pendingRequests.value = res.data?.data ?? [];
    pendingTotal.value = res.data?.metadata?.total ?? 0;
  } catch (err) {
    console.error("Failed to load pending requests:", err);
    pendingError.value = err;
    pendingRequests.value = [];
    pendingTotal.value = 0;
  } finally {
    pendingLoading.value = false;
  }
}

async function fetchReviewedRequests() {
  reviewedLoading.value = true;
  reviewedError.value = null;
  try {
    const offset = (reviewedPage.value - 1) * itemsPerPage.value;
    const res = await AccessRequestService.reviewedByMe({
      offset,
      limit: itemsPerPage.value,
      sort_by: "reviewed_at",
      sort_order: "desc",
    });
    reviewedRequests.value = res.data?.data ?? [];
    reviewedTotal.value = res.data?.metadata?.total ?? 0;
  } catch (err) {
    console.error("Failed to load reviewed requests:", err);
    reviewedError.value = err;
    reviewedRequests.value = [];
    reviewedTotal.value = 0;
  } finally {
    reviewedLoading.value = false;
  }
}

function refreshAll() {
  fetchPendingRequests();
  fetchReviewedRequests();
}

function viewRequest(request) {
  router.push({ path: `/access-requests/${request.id}` }).catch(() => {});
}

function openReviewModal(request, action) {
  reviewModal.value?.show?.(request, action);
}

watch([pendingPage, itemsPerPage], () => {
  fetchPendingRequests();
});

watch([reviewedPage, itemsPerPage], () => {
  fetchReviewedRequests();
});

onMounted(() => {
  setNav();
  fetchPendingRequests();
  fetchReviewedRequests();
});
</script>

<style scoped>
.tab-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  background-color: rgb(219 234 254);
  color: rgb(29 78 216);
}

.dark .tab-count-badge {
  background-color: rgb(30 58 138 / 0.5);
  color: rgb(147 197 253);
}
</style>

<route lang="yaml">
meta:
  title: Access Requests
  nav:
    - { label: "Access Requests" }
</route>
