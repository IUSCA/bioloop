import accessRequestService from "@/services/v2/access-requests";

/**
 * Composable: useAccessRequestDrafts
 *
 * Fetches DRAFT access requests for a given resource.
 * Used by RequestAccessModal to detect existing drafts.
 */
export function useAccessRequestDrafts(resourceIdRef) {
  const drafts = ref([]);
  const loading = ref(false);
  const error = ref(null);
  const total = ref(0);

  async function fetch(resourceId) {
    if (!resourceId) {
      drafts.value = [];
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await accessRequestService.requestedByMe({
        resource_id: resourceId,
        status: "DRAFT",
        limit: 10,
      });
      drafts.value = response?.data?.data || [];
      total.value = response?.data?.metadata?.total || drafts.value.length;
    } catch (err) {
      error.value = err?.response?.data?.message || "Failed to load drafts";
      drafts.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  // If resourceIdRef is provided, auto-fetch drafts when it changes
  if (resourceIdRef) {
    watch(
      resourceIdRef,
      (newId) => {
        fetch(newId);
      },
      { immediate: true },
    );
  }

  return {
    drafts: readonly(drafts),
    loading: readonly(loading),
    error: readonly(error),
    total: readonly(total),
    fetch,
  };
}
