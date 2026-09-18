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

        <!--
          A decided request is not the same as access the subject still has. Say which,
          rather than letting APPROVED stand for both.
          @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
        -->
        <p v-if="accessNote" class="text-sm" :class="accessNoteClass">
          {{ accessNote }}
        </p>

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
 * nothing else: the decision detail belongs on the request detail page. The Review button reads
 * the row's `_meta.capabilities` and `_meta.available_actions`, which every access-request list
 * sends.
 *
 * @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
 */
import Badge from "@/components/v2/Badge.vue";
import ResourceChip from "@/components/v2/ResourceChip.vue";
import { admits, holds } from "@/composables/useCapabilities";
import * as datetime from "@/services/datetime";

const props = defineProps({
  request: {
    type: Object,
    required: true,
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

// `review` arrives only while the request is under review and the viewer may decide it, and
// the request's own state says whether a review can still happen at all. Hidden rather than
// disabled: a decided request is never reviewed again.
// @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
const canReviewThis = computed(
  () => holds(props.request, "review") && admits(props.request, "review"),
);

const DECIDED = ["APPROVED", "PARTIALLY_APPROVED"];

// Silent unless the request was decided and produced grants. A request still under review
// has nothing to say here, and one that produced nothing is explained on the detail page,
// where the coverage query can say whether the access arrives some other way.
const accessNote = computed(() => {
  const summary = props.request.access_summary;
  if (!summary || !DECIDED.includes(props.request.status)) return null;
  if (summary.issued === 0) return null;
  if (summary.live === 0) return "No live access from this request";
  if (summary.live < summary.issued) {
    return `${summary.live} of ${summary.issued} permissions still live`;
  }
  return null;
});

const accessNoteClass = computed(() =>
  props.request.access_summary?.live === 0
    ? "text-red-700 dark:text-red-400"
    : "text-amber-700 dark:text-amber-400",
);
</script>
