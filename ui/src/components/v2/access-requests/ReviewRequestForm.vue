<template>
  <form @submit.prevent="emit('submit')" class="flex flex-col gap-6">
    <ModernCard title="Request">
      <RequestContextHeader :request="props.request" />
    </ModernCard>

    <section v-if="items.length" class="flex flex-col gap-3">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-baseline gap-2">
          <h3 class="v2-card-title">Your decisions</h3>
          <span class="text-xs va-text-secondary">
            {{ decidedCount }} of {{ items.length }} decided
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            :class="BULK_ACTION"
            @click="formState.approveAll()"
          >
            <i-mdi-check-all class="text-sm" />
            Approve all
          </button>
          <button
            type="button"
            :class="BULK_ACTION"
            @click="formState.rejectAll()"
          >
            <i-mdi-close-circle-multiple-outline class="text-sm" />
            Reject all
          </button>
        </div>
      </header>

      <!-- No inner scroll. The modal body is already a scrolling region, and a second one
           clipped the last row mid-sentence with nothing to say it had more. -->
      <TransitionGroup name="list" tag="div" class="flex flex-col gap-2">
        <ReviewItemRow
          v-for="item in items"
          :key="item.id"
          :item="item"
          :decision="formState.decisions.get(item.id)"
          :approved-expiry="formState.expiries.get(item.id) || {}"
          @update:decision="(d) => formState.setDecision(item.id, d)"
          @update:approved-expiry="(e) => formState.setExpiry(item.id, e)"
        />
      </TransitionGroup>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="v2-card-title">
        Decision reason
        <span class="text-red-600 dark:text-red-400" aria-hidden="true">*</span>
      </h3>
      <p class="text-xs va-text-secondary">
        The requester sees this, whatever you decide.
      </p>
      <VaTextarea
        v-model="formState.decisionReason"
        placeholder="Explain your decisions — especially any rejections…"
        class="w-full"
        aria-label="Decision reason"
        :min-rows="3"
        :max-rows="6"
      />
    </section>
  </form>
</template>

<script setup>
/**
 * The reviewer's side of the access request modal: the context, one row per requested item,
 * and the reason that goes back to the requester.
 *
 * The running tally and the reason the Submit button is disabled both live in the modal
 * footer rather than here. They were printed in both places, seventy pixels apart, and a
 * blocker belongs beside the button it blocks. The scope note sits under the access preview,
 * because it qualifies what that preview promises.
 *
 * @see docs/contributing/v2-design-system.md — Typography
 */
import ModernCard from "@/components/utils/ModernCard.vue";
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
  /** USER or GROUP. Derived by the modal from the request's subject row. */
  subjectType: {
    type: String,
    default: null,
  },
  /** DATASET or COLLECTION. Derived by the modal from the request's resource row. */
  resourceType: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(["submit", "cancel"]);

// Both bulk shortcuts read the same, because neither is the recommended one. The earlier
// pair were tinted emerald and red, which gave "Reject all" the weight of a decision that
// had already been taken.
const BULK_ACTION =
  "focus-ring inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 " +
  "text-xs font-medium border border-solid " +
  "border-gray-300 dark:border-gray-600 va-text-secondary " +
  "hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200";

const items = computed(() => props.request?.access_request_items ?? []);

const decidedCount = computed(
  () => props.formState.approvedCount + props.formState.rejectedCount,
);

// The reason writes straight through to the composable, the way `RequestAccessForm` writes
// its own fields. A local copy plus a watcher kept the two in step here, and the copy was
// once not written back at all, which left `isSubmitEnabled` false however much the reviewer
// typed. There is no second value to fall out of step now.
</script>
