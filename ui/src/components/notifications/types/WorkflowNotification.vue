<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-medium text-sm">{{ props.notification.payload?.workflowName }}</span>
      <span
        v-if="props.notification.payload?.status"
        class="notif-status-badge"
        :class="`status-${props.notification.payload.status}`"
      >
        <span class="status-dot" />
        {{ props.notification.payload.status }}
      </span>
    </div>
    <p v-if="props.notification.payload?.step" class="text-xs" style="color: var(--va-secondary)">
      Step: {{ props.notification.payload.step }}
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
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});
</script>

<style scoped>
.notif-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: capitalize;
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.status-approved,
.status-completed {
  background: rgba(61, 146, 9, 0.12);
  color: var(--va-success);
}

.status-rejected,
.status-failed {
  background: rgba(228, 34, 34, 0.12);
  color: var(--va-danger);
}

.status-pending {
  background: rgba(255, 212, 58, 0.12);
  color: #b38600;
}

.dark .status-pending {
  color: var(--va-warning);
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
