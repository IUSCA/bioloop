import accessRequestService from "@/services/v2/access-requests";
import { reactive } from "vue";

/**
 * Form state for one access request, and the call that files it.
 *
 * Returns `reactive()` rather than a plain object of refs. A plain object is not tracked, so
 * `v-model="formState.subject"` replaced a ref on an object nothing was watching: the
 * composable never saw the subject, `isFormValidForSubmit` stayed false, and the form could
 * not be submitted at all. `reactive` unwraps the refs on read and writes through on
 * assignment, which is what every binding already assumed.
 *
 * @see docs/design/groups/implementation/access-requests-plan.md — B6
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
   * Create the request and put it under review, in one call.
   *
   * The server performs both steps in one transaction. A DRAFT is invisible — no surface
   * lists one — so chaining create and submit from here would strand a row the requester
   * could neither see nor resume if the second call failed.
   *
   * @see docs/design/groups/implementation/access-requests-plan.md — B1
   */
  async function submit() {
    if (!isFormValidForSubmit.value) {
      return;
    }

    isSubmitting.value = true;
    conflictError.value = null;

    try {
      const data = {
        // RENEWAL is not implemented; the route accepts only NEW.
        type: "NEW",
        resource_id: resource.id,
        subject_id: subject.value.id,
        items: buildItems(),
        purpose: purpose.value,
        submit: true,
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
        // The caller reads the null return and leaves the conflict alert to the form.
        return null;
      }
      const message = data?.message || "Failed to submit access request";
      throw new Error(message);
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

  return reactive({
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
  });
}
