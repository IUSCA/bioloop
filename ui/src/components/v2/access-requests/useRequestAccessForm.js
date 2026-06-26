import accessRequestService from "@/services/v2/access-requests";

/**
 * Composable: useRequestAccessForm
 *
 * Manages form state for creating/updating access requests.
 * Handles submitting for review.
 */
export function useRequestAccessForm({ resource }) {
  // Form state
  const subject = ref(null);
  const selectedPreset = ref(null);
  const selectedTypes = ref(new Set());
  const expiry = ref({ type: "never", value: null });
  const purpose = ref("");

  // Loading/error states
  const isSubmitting = ref(false);
  const conflictError = ref(null);

  // Computed: Check if form is valid for submission
  const isFormValidForSubmit = computed(() => {
    return (
      subject.value?.id &&
      (selectedPreset.value || selectedTypes.value.size > 0) &&
      purpose.value?.trim()
    );
  });

  /**
   * Build request items array
   */
  function buildItems() {
    const items = [];
    if (selectedPreset.value) {
      items.push({
        preset_id: selectedPreset.value,
        requested_expiry: expiry.value,
      });
    }
    selectedTypes.value.forEach((access_type_id) => {
      items.push({
        access_type_id,
        requested_expiry: expiry.value,
      });
    });
    return items;
  }

  /**
   * Create and submit request for review
   */
  async function submit() {
    if (!isFormValidForSubmit.value) {
      return;
    }

    isSubmitting.value = true;
    conflictError.value = null;

    try {
      const data = {
        resource_type: resource.type,
        resource_id: resource.id,
        subject_id: subject.value.id,
        items: buildItems(),
        purpose: purpose.value,
      };

      const response = await accessRequestService.create(data);
      return response.data;
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      // Handle 409 conflict (in-flight conflict)
      if (status === 409) {
        const conflictingIds = data.details || {};
        conflictError.value = {
          message: data.message || "Request conflicts with existing review",
          access_type_ids: conflictingIds.access_type_ids || [],
          preset_ids: conflictingIds.preset_ids || [],
          request_ids: conflictingIds.request_ids || [],
        };
      } else {
        const message = data?.message || "Failed to submit access request";
        throw new Error(message);
      }
    } finally {
      isSubmitting.value = false;
    }
  }

  /**
   * Reset conflict error
   */
  function resetConflictError() {
    conflictError.value = null;
  }

  /**
   * Reset form to blank state
   */
  function reset() {
    subject.value = null;
    selectedPreset.value = null;
    selectedTypes.value = new Set();
    expiry.value = { type: "never", value: null };
    purpose.value = "";
    conflictError.value = null;
  }

  return {
    // Form state
    subject,
    selectedPreset,
    selectedTypes,
    expiry,
    purpose,

    // Status
    isSubmitting,
    conflictError,

    // Computed
    isFormValidForSubmit,

    // Methods
    submit,
    resetConflictError,
    reset,
    buildItems,
  };
}
