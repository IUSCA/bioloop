<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm va-text-secondary">
      Review and manage access requests you are responsible for.
    </p>

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

        <!--
          The caller's own requests, which no other page listed. Kept distinct from the
          two reviewer tabs above, because the audiences differ.
          @see docs/design/groups/ui-information-architecture.md - The Requests tab never disappears
        -->
        <VaTab name="mine">
          <span class="flex items-center gap-1.5">
            My requests
            <span v-if="mineTotal !== null" class="tab-count-badge">
              {{ mineTotal }}
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
            :show-clear-filters="false"
          />
        </div>

        <div v-else key="list">
          <div class="space-y-4">
            <AccessRequestCard
              v-for="req in pendingRequests"
              :key="req.id"
              :request="req"
              @review="openReviewModal"
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
    <div v-else-if="activeTab === 'reviewed'">
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
            :show-clear-filters="false"
          />
        </div>

        <div v-else key="list">
          <div class="space-y-4">
            <AccessRequestCard
              v-for="req in reviewedRequests"
              :key="req.id"
              :request="req"
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

    <!-- My requests -->
    <div v-else>
      <Transition name="fade-slide" mode="out-in">
        <div v-if="mineError" key="error" class="py-12 px-6">
          <ErrorState
            title="Failed to load your requests"
            :message="mineError?.message"
            @retry="fetchMyRequests"
          />
        </div>

        <div
          v-else-if="!mineLoading && myRequests.length === 0"
          key="empty"
          class="py-12 px-6"
        >
          <EmptyState
            icon="mdi-file-document-outline"
            title="You have not asked for anything yet"
            message="Open a dataset or collection you can see and use Request access. Your requests and their decisions appear here."
            :show-clear-filters="false"
          />
        </div>

        <div v-else key="list">
          <div class="space-y-4">
            <AccessRequestCard
              v-for="req in myRequests"
              :key="req.id"
              :request="req"
              @view="viewRequest"
            />
          </div>

          <Pagination
            class="mt-5 px-5"
            v-model:page="minePage"
            v-model:page_size="itemsPerPage"
            :total_results="mineTotal"
            :curr_items="myRequests.length"
          />
        </div>
      </Transition>
    </div>

    <!-- Mounted only while a review is open, so a fresh instance loads each request. -->
    <ReviewRequestModal
      v-if="reviewingId"
      ref="reviewModal"
      :request-id="reviewingId"
      @reviewed="onReviewed"
    />
  </div>
</template>

<script setup>
import AccessRequestCard from "@/components/v2/access-requests/AccessRequestCard.vue";
import ReviewRequestModal from "@/components/v2/access-requests/ReviewRequestModal.vue";
import AccessRequestService from "@/services/v2/access-requests";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
const router = useRouter();
const route = useRoute();

// The dashboard links straight at one tab, so the tab is addressable.
const TABS = ["pending", "reviewed", "mine"];
const activeTab = ref(
  TABS.includes(route.query.tab) ? route.query.tab : "pending",
);
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

const myRequests = ref([]);
const mineTotal = ref(null);
const minePage = ref(1);
const mineLoading = ref(true);
const mineError = ref(null);

const reviewModal = ref(null);
const reviewingId = ref(null);

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

async function fetchMyRequests() {
  mineLoading.value = true;
  mineError.value = null;
  try {
    const offset = (minePage.value - 1) * itemsPerPage.value;
    const res = await AccessRequestService.requestedByMe({
      offset,
      limit: itemsPerPage.value,
      sort_by: "created_at",
      sort_order: "desc",
    });
    myRequests.value = res.data?.data ?? [];
    mineTotal.value = res.data?.metadata?.total ?? 0;
  } catch (err) {
    console.error("Failed to load your requests:", err);
    mineError.value = err;
    myRequests.value = [];
    mineTotal.value = 0;
  } finally {
    mineLoading.value = false;
  }
}

function refreshAll() {
  fetchPendingRequests();
  fetchReviewedRequests();
  fetchMyRequests();
}

function viewRequest(request) {
  router.push(`/v2/access-requests/${request.id}`).catch(() => {});
}

function openReviewModal(request) {
  reviewingId.value = request.id;
  nextTick(() => reviewModal.value?.show?.());
}

function onReviewed() {
  reviewingId.value = null;
  refreshAll();
}

watch([pendingPage, itemsPerPage], () => {
  fetchPendingRequests();
});

watch([reviewedPage, itemsPerPage], () => {
  fetchReviewedRequests();
});

watch([minePage, itemsPerPage], () => {
  fetchMyRequests();
});

onMounted(() => {
  setNav();
  refreshAll();
});
</script>

<route lang="yaml">
meta:
  title: Access Requests
  nav:
    - { label: "Access Requests" }
</route>
