<template>
  <form @submit.prevent="emit('submit')" class="flex flex-col h-full space-y-4">
    <!-- Request Context Header -->
    <ModernCard>
      <RequestContextHeader :request="props.request" />
    </ModernCard>

    <!-- Bulk Action Shortcuts -->
    <div
      v-if="props.request?.access_request_items?.length"
      class="flex items-center gap-2"
    >
      <button
        type="button"
        @click="formState.approveAll()"
        class="text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
      >
        <i-mdi-check-all class="inline mr-1" />
        Approve All
      </button>
      <button
        type="button"
        @click="formState.rejectAll()"
        class="text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
      >
        <i-mdi-close-all class="inline mr-1" />
        Reject All
      </button>
    </div>

    <!-- Items Section -->
    <div
      v-if="props.request?.access_request_items?.length"
      class="space-y-2 max-h-80 overflow-y-auto"
    >
      <p
        class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1"
      >
        Request Items
      </p>
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <ReviewItemRow
          v-for="item in props.request.access_request_items"
          :key="item.id"
          :item="item"
          :decision="formState.decisions.get(item.id)"
          :approved-expiry="formState.expiries.get(item.id) || {}"
          @update:decision="(d) => formState.setDecision(item.id, d)"
          @update:approved-expiry="(e) => formState.setExpiry(item.id, e)"
        />
      </TransitionGroup>
    </div>

    <!-- Decision Reason -->
    <div class="space-y-2">
      <p
        class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        <span>Decision Reason</span>
        <span class="text-red-500">*</span>
      </p>
      <VaTextarea
        :model-value="decisionReasonValue"
        @update:model-value="updateDecisionReason"
        placeholder="Explain your decisions — especially any rejections..."
        class="w-full"
        :min-rows="3"
        :max-rows="4"
      />
      <p v-if="reasonError" class="text-xs text-red-600 dark:text-red-400">
        {{ reasonError }}
      </p>
    </div>

    <!-- Grant Scope Message -->
    <GrantScopeMessage
      :subject-type="props.request?.subject_type"
      :resource-type="props.request?.resource_type"
    />

    <!-- Footer with submit state info -->
    <div
      v-if="formState.submitDisableReason"
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3"
    >
      <p
        class="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2"
      >
        <i-mdi-alert-circle-outline class="flex-shrink-0 mt-0.5" />
        {{ formState.submitDisableReason }}
      </p>
    </div>

    <!-- Stats footer -->
    <div
      class="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700"
    >
      <p>
        <strong>{{ formState.approvedCount }}</strong> approved,
        <strong>{{ formState.rejectedCount }}</strong> rejected
      </p>
    </div>
  </form>
</template>

<script setup>
import ModernCard from "@/components/utils/ModernCard.vue";
import GrantScopeMessage from "@/components/v2/grants/issue/GrantScopeMessage.vue";
import RequestContextHeader from "./RequestContextHeader.vue";
import ReviewItemRow from "./ReviewItemRow.vue";

const props = defineProps({
  request: {
    type: Object,
    required: true,
  },
  formState: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["submit", "cancel"]);

const reasonError = ref("");
const decisionReasonValue = ref(props.formState?.decisionReason || "");

const validateReason = () => {
  if (decisionReasonValue.value.trim()) {
    reasonError.value = "";
  }
};

const updateDecisionReason = (value) => {
  decisionReasonValue.value = value;
  validateReason();
};

// Watch for external changes to formState.decisionReason
watch(
  () => props.formState?.decisionReason,
  (newValue) => {
    if (newValue !== decisionReasonValue.value) {
      decisionReasonValue.value = newValue || "";
    }
  },
);
</script>
