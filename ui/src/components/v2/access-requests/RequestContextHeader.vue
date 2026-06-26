<template>
  <div class="space-y-4">
    <!-- Resource -->
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3">
        <span
          class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Resource
        </span>
      </div>
      <ResourceChip
        v-if="props.request?.resource"
        :resource="props.request.resource"
      />
    </div>

    <!-- Requester -->
    <div class="flex items-start justify-between">
      <span
        class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        Requester
      </span>
      <div class="flex items-center gap-2">
        <UserAvatar
          :username="props.request?.requester?.username"
          :name="props.request?.requester?.name"
        />
        <div class="text-right">
          <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
            {{
              props.request?.requester?.name ||
              props.request?.requester?.username
            }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ props.request?.requester?.email }}
          </div>
        </div>
      </div>
    </div>

    <!-- Subject -->
    <div class="flex items-start justify-between">
      <span
        class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        For
      </span>
      <div>
        <SubjectChip
          v-if="props.request?.subject"
          :subject="props.request.subject"
        />
        <span
          v-if="isRequestingForSelf"
          class="text-xs text-gray-500 dark:text-gray-400 italic"
        >
          requesting for themselves
        </span>
      </div>
    </div>

    <!-- Purpose -->
    <div class="space-y-1">
      <span
        class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        Purpose
      </span>
      <div
        v-if="props.request?.purpose"
        class="rounded-lg border-l-4 border-solid border-blue-500 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-200"
      >
        {{ props.request.purpose }}
      </div>
      <div v-else class="text-xs italic text-gray-400 dark:text-gray-500">
        No purpose provided
      </div>
    </div>

    <!-- Submitted -->
    <div class="flex items-center justify-between text-xs">
      <span class="text-gray-500 dark:text-gray-400">
        Submitted {{ relativeTime }}
      </span>
      <va-chip
        size="small"
        :color="statusColorMap[props.request?.status] || 'primary'"
      >
        {{ props.request?.status }}
      </va-chip>
    </div>
  </div>
</template>

<script setup>
import UserAvatar from "@/components/utils/UserAvatar.vue";
import ResourceChip from "@/components/v2/ResourceChip.vue";
import SubjectChip from "@/components/v2/SubjectChip.vue";
import * as datetime from "@/services/datetime";
import { computed } from "vue";

const props = defineProps({
  request: {
    type: Object,
    required: true,
  },
});

const statusColorMap = {
  DRAFT: "secondary",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "danger",
  WITHDRAWN: "secondary",
};

const isRequestingForSelf = computed(
  () =>
    props.request?.requester?.id &&
    props.request?.subject?.id &&
    props.request.requester.id === props.request.subject.id,
);

const relativeTime = computed(() => {
  if (!props.request?.created_at) return "";
  return datetime.fromNow(props.request.created_at, false);
});
</script>
