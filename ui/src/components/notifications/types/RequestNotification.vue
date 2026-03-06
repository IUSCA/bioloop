<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-medium text-sm capitalize">{{ props.notification.payload?.requestType }} Request</span>
    </div>
    <p v-if="props.notification.payload?.requesterName" class="text-xs" style="color: var(--va-secondary)">
      From: {{ props.notification.payload.requesterName }}
    </p>
    <p v-if="props.notification.payload?.dueDate" class="text-xs" style="color: var(--va-secondary)">
      Due: {{ formatDate(props.notification.payload.dueDate) }}
    </p>
    <a
      v-if="props.notification.payload?.actionUrl"
      :href="props.notification.payload.actionUrl"
      class="notif-action-link"
      target="_blank"
      rel="noopener"
    >
      {{ props.notification.payload.actionLabel || "View" }}
      <i-mdi-open-in-new class="inline text-xs ml-0.5" />
    </a>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});

function formatDate(value) {
  return datetime.date(value);
}
</script>

<style scoped>
.notif-action-link {
  font-size: 0.75rem;
  color: var(--va-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.notif-action-link:hover {
  text-decoration: underline;
}
</style>
