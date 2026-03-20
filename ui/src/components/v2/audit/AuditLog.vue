<template>
  <div class="flex items-center gap-3 min-w-0">
    <ColoredDot :color="dotColor" />

    <span
      class="flex-shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100"
    >
      {{ eventLabel }}
    </span>

    <AuditLogMessage :record="record" />

    <span
      class="text-sm text-slate-500 dark:text-slate-400 ml-auto flex-shrink-0"
    >
      {{ relativeTime }}
    </span>
  </div>
</template>

<script setup>
import ColoredDot from "@/components/utils/ColoredDot.vue";
import AuditLogMessage from "@/components/v2/audit/AuditLogMessage.vue";
import * as datetime from "@/services/datetime";
import { snakeCaseToTitleCase } from "@/services/utils";

const props = defineProps({
  record: {
    type: Object,
    required: true,
  },
  relativeTime: {
    type: Boolean,
    default: true,
  },
});

const eventLabel = computed(() => {
  if (!props.record?.event_type) return "";
  return snakeCaseToTitleCase(props.record.event_type);
});

const colorMap = {
  created: "emerald",
  approved: "emerald",
  granted: "emerald",
  submitted: "sky",
  updated: "sky",
  added: "emerald",
  removed: "rose",
  revoked: "rose",
  rejected: "rose",
  deleted: "rose",
  expired: "amber",
  archived: "amber",
  unarchived: "amber",
};

const dotColor = computed(() => {
  const eventType = (props.record?.event_type || "").toLowerCase();
  const action = eventType.split("_").pop();

  return colorMap[action] ?? "slate";
});

const relativeTime = computed(() => {
  if (!props.record?.timestamp) return "";
  return props.relativeTime
    ? datetime.fromNow(props.record.timestamp)
    : datetime.displayDateTime(props.record.timestamp);
});
</script>
