/**
 * Composable for managing review request form state.
 * Handles item decisions, expiry overrides, and API calls.
 */

import accessRequestsService from "@/services/v2/access-requests";
import { computed, ref, watch } from "vue";

export function useReviewRequestForm(request) {
  // Per-item decision state: Map<itemId, 'APPROVED' | 'REJECTED' | null>
  const decisions = ref(new Map());

  // Per-item approved expiry overrides: Map<itemId, { type: 'never'|'date', value: Date|null }>
  const expiries = ref(new Map());

  // Overall decision reason (required to submit)
  const decisionReason = ref("");

  // Initialize decisions to null for all items
  const initializeItemStates = () => {
    if (!request) return;
    decisions.value = new Map();
    expiries.value = new Map();
    request.access_request_items?.forEach((item) => {
      decisions.value.set(item.id, null);
      // Initialize expiry with requester's asked value
      expiries.value.set(item.id, {
        type: item.requested_until ? "date" : "never",
        value: item.requested_until ? new Date(item.requested_until) : null,
      });
    });
  };

  // Derived computed: approved items payload for compute-effective-grants
  const approvedItemsPayload = computed(() => {
    if (!request) return [];
    return request.access_request_items
      ?.filter((item) => decisions.value.get(item.id) === "APPROVED")
      .map((item) => {
        const expiry = expiries.value.get(item.id) || {
          type: "never",
          value: null,
        };
        if (item.preset_id) {
          return {
            preset_id: item.preset_id,
            approved_expiry: expiry,
          };
        }
        return {
          access_type_id: item.access_type_id,
          approved_expiry: expiry,
        };
      });
  });

  // Derived computed: approval statistics
  const approvedCount = computed(
    () =>
      Array.from(decisions.value.values()).filter((d) => d === "APPROVED")
        .length,
  );

  const rejectedCount = computed(
    () =>
      Array.from(decisions.value.values()).filter((d) => d === "REJECTED")
        .length,
  );

  // Check if all items have a decision
  const allDecided = computed(() => {
    if (!request) return false;
    return request.access_request_items?.every(
      (item) => decisions.value.get(item.id) !== null,
    );
  });

  // Check if submit is enabled (all items decided, reason provided, expiries valid)
  const isSubmitEnabled = computed(() => {
    if (!allDecided.value) return false;
    if (!decisionReason.value.trim()) return false;

    // Check that all APPROVED items have valid future expiries
    for (const [itemId, decision] of decisions.value.entries()) {
      if (decision === "APPROVED") {
        const expiry = expiries.value.get(itemId);
        if (expiry.type === "date" && expiry.value <= new Date()) {
          return false;
        }
      }
    }
    return true;
  });

  // Determine submit disable reason
  const submitDisableReason = computed(() => {
    if (!allDecided.value) {
      return "Decide on all items before submitting.";
    }
    if (!decisionReason.value.trim()) {
      return "A decision reason is required.";
    }
    // Check expiry validity
    for (const [itemId, decision] of decisions.value.entries()) {
      if (decision === "APPROVED") {
        const expiry = expiries.value.get(itemId);
        if (expiry.type === "date" && expiry.value <= new Date()) {
          return "One or more approved expiry dates are in the past.";
        }
      }
    }
    return null;
  });

  // Actions
  const setDecision = (itemId, decision) => {
    decisions.value.set(itemId, decision);

    // Auto-populate expiry default when switching to APPROVED
    if (decision === "APPROVED" && !expiries.value.has(itemId)) {
      const item = request?.access_request_items?.find((i) => i.id === itemId);
      if (item) {
        expiries.value.set(itemId, {
          type: item.requested_until ? "date" : "never",
          value: item.requested_until ? new Date(item.requested_until) : null,
        });
      }
    }
  };

  const setExpiry = (itemId, expiry) => {
    expiries.value.set(itemId, expiry);
  };

  const approveAll = () => {
    if (!request) return;
    request.access_request_items?.forEach((item) => {
      setDecision(item.id, "APPROVED");
    });
  };

  const rejectAll = () => {
    if (!request) return;
    request.access_request_items?.forEach((item) => {
      setDecision(item.id, "REJECTED");
    });
  };

  // API calls
  const submit = async (requestId) => {
    const itemDecisions = request.access_request_items?.map((item) => {
      const decision = decisions.value.get(item.id);
      const payload = {
        id: item.id,
        decision,
      };

      if (decision === "APPROVED") {
        const expiry = expiries.value.get(item.id) || {
          type: "never",
          value: null,
        };
        payload.approved_expiry = expiry;
      }

      return payload;
    });

    return accessRequestsService.review(requestId, {
      item_decisions: itemDecisions,
      decision_reason: decisionReason.value,
    });
  };

  // Watch request changes and reinitialize
  watch(
    () => request,
    () => {
      initializeItemStates();
    },
    { immediate: true },
  );

  return {
    decisions,
    expiries,
    decisionReason,
    approvedItemsPayload,
    approvedCount,
    rejectedCount,
    allDecided,
    isSubmitEnabled,
    submitDisableReason,
    setDecision,
    setExpiry,
    approveAll,
    rejectAll,
    submit,
    initializeItemStates,
  };
}
