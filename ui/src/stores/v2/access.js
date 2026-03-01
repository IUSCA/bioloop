import AccessRequestService from "@/services/v2/access-requests";
import { defineStore } from "pinia";

/**
 * Store for v2 Access domain.
 * Manages access requests and the pending-review count badge used in navigation.
 */
export const useAccessStore = defineStore("v2/access", () => {
  // Pending review count — drives nav badge for group admins
  const pendingReviewCount = ref(0);
  const pendingReviewCountLoading = ref(false);

  async function fetchPendingReviewCount() {
    pendingReviewCountLoading.value = true;
    try {
      const {
        data: { metadata },
      } = await AccessRequestService.pendingReview();
      pendingReviewCount.value = metadata.total;
    } catch {
      // Non-admin users will get a 403 — suppress and show zero
      pendingReviewCount.value = 0;
    } finally {
      pendingReviewCountLoading.value = false;
    }
  }

  // Requests submitted by the current user
  const myRequests = ref([]);
  const myRequestsLoading = ref(false);

  async function fetchMyRequests() {
    myRequestsLoading.value = true;
    try {
      const {
        data: { data: items },
      } = await AccessRequestService.requestedByMe();
      myRequests.value = items;
    } finally {
      myRequestsLoading.value = false;
    }
  }

  // Requests pending the current user's review
  const pendingRequests = ref([]);
  const pendingRequestsLoading = ref(false);

  async function fetchPendingRequests() {
    pendingRequestsLoading.value = true;
    try {
      const {
        data: { metadata, data: items },
      } = await AccessRequestService.pendingReview();
      // API may return {} instead of [] when there are no results — normalize to array
      pendingRequests.value = Array.isArray(items) ? items : [];
      pendingReviewCount.value = metadata.total;
    } catch {
      pendingRequests.value = [];
    } finally {
      pendingRequestsLoading.value = false;
    }
  }

  function $reset() {
    pendingReviewCount.value = 0;
    myRequests.value = [];
    pendingRequests.value = [];
  }

  return {
    pendingReviewCount,
    pendingReviewCountLoading,
    fetchPendingReviewCount,
    myRequests,
    myRequestsLoading,
    fetchMyRequests,
    pendingRequests,
    pendingRequestsLoading,
    fetchPendingRequests,
    $reset,
  };
});
