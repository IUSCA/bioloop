<template>
  <div class="flex items-start gap-3 min-w-0">
    <span class="mt-2 h-2 w-2 flex-shrink-0 rounded-full" :class="dotClass" />

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

const dotClass = computed(() => {
  const eventType = (props.record?.event_type || "").toLowerCase();
  const action = eventType.split("_").pop();

  const mapping = {
    created: "bg-emerald-500",
    approved: "bg-emerald-500",
    granted: "bg-emerald-500",
    submitted: "bg-sky-500",
    updated: "bg-sky-500",
    added: "bg-emerald-500",
    removed: "bg-rose-500",
    revoked: "bg-rose-500",
    rejected: "bg-rose-500",
    deleted: "bg-rose-500",
    expired: "bg-amber-500",
    archived: "bg-amber-500",
  };

  return mapping[action] ?? "bg-slate-300";
});

const relativeTime = computed(() => {
  if (!props.record?.timestamp) return "";
  return props.relativeTime
    ? datetime.fromNow(props.record.timestamp)
    : datetime.displayDateTime(props.record.timestamp);
});
</script>
