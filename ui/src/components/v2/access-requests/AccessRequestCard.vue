<template>
  <div
    class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
    role="button"
    tabindex="0"
    @click="emit('view', props.request)"
    @keydown.enter="emit('view', props.request)"
    @keydown.space.prevent="emit('view', props.request)"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex flex-col gap-2 min-w-0 flex-1">
        <!-- What is being asked for, and by whom -->
        <div class="flex flex-wrap items-center gap-2">
          <ResourceChip
            v-if="props.request.resource"
            :resource="props.request.resource"
          />
          <Badge :color="STATUS_TONE[props.request.status] || 'neutral'">
            {{ statusLabel }}
          </Badge>
        </div>

        <div
          class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm va-text-secondary"
        >
          <span>{{ requesterName }}</span>
          <span v-if="subjectName" class="va-text-secondary">
            for <span class="font-medium">{{ subjectName }}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{{ itemCountLabel }}</span>
          <span v-if="timeLabel" aria-hidden="true">·</span>
          <span v-if="timeLabel">{{ timeLabel }}</span>
        </div>

        <p
          v-if="props.request.purpose"
          class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2"
        >
          {{ props.request.purpose }}
        </p>
      </div>

      <!-- A reviewer decides on the detail page or in the modal; the card only opens one. -->
      <VaButton
        v-if="canReviewThis"
        preset="primary"
        size="small"
        @click.stop="emit('review', props.request)"
      >
        Review
      </VaButton>
    </div>
  </div>
</template>

<script setup>
/**
 * AccessRequestCard
 *
 * One row in a list of access requests, on the queue page and on both resource tabs.
 *
 * It carries the requester, the subject, the resource, the status, and the item count, and
 * nothing else: the decision detail belongs on the request detail page. The three call sites
 * previously passed `canAct` and `canReview` for the same idea and the component read
 * neither, so both are `canAct` now.
 *
 * @see docs/design/groups/access-requests-plan.md — B2
 */
import Badge from "@/components/v2/Badge.vue";
import ResourceChip from "@/components/v2/ResourceChip.vue";
import * as datetime from "@/services/datetime";

const props = defineProps({
  request: {
    type: Object,
    required: true,
  },
  /** Whether the viewer may decide this request. The Review button is offered only then. */
  canAct: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["review", "view"]);

const STATUS_TONE = {
  DRAFT: "neutral",
  UNDER_REVIEW: "primary",
  APPROVED: "success",
  PARTIALLY_APPROVED: "warning",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
};

const statusLabel = computed(() =>
  (props.request.status || "").replaceAll("_", " "),
);

const requesterName = computed(
  () =>
    props.request.requester?.name ||
    props.request.requester?.username ||
    "Unknown requester",
);

// Only worth naming when it is not the requester asking for themselves.
const subjectName = computed(() => {
  const subject = props.request.subject;
  if (!subject) return null;
  if (subject.id === props.request.requester_id) return null;
  return subject.group?.name || subject.user?.name || subject.user?.username;
});

const itemCountLabel = computed(() => {
  const count = props.request.access_request_items?.length ?? 0;
  return count === 1 ? "1 item" : `${count} items`;
});

// Submitted is the moment a reviewer cares about; a request not yet submitted has only
// been created.
const timeLabel = computed(() => {
  const at = props.request.submitted_at || props.request.created_at;
  if (!at) return "";
  return datetime.fromNowShort(at);
});

const canReviewThis = computed(
  () => props.canAct && props.request.status === "UNDER_REVIEW",
);
</script>
