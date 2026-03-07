<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-if="props.notification.payload?.requestTitle || props.notification.payload?.requesterName || props.notification.payload?.dueDate"
      class="notif-request-meta"
    >
      <span v-if="props.notification.payload?.requestTitle || props.notification.payload?.requesterName">
        {{ props.notification.payload?.requestTitle || props.notification.payload?.requesterName }}
      </span>
      <template v-if="props.notification.payload?.dueDate">
        <span class="notif-meta-dot">·</span>
        <span>Due {{ formatDate(props.notification.payload.dueDate) }}</span>
      </template>
    </div>
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
.notif-request-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--va-secondary);
}

.notif-meta-dot {
  color: var(--va-secondary);
  opacity: 0.5;
}

.notif-action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--va-background-border);
  background: transparent;
  color: var(--va-text-primary);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

.notif-action-link:hover {
  border-color: var(--va-secondary);
  background: var(--va-background-secondary);
  text-decoration: none;
}
</style>
