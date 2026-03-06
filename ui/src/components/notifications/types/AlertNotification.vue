<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-medium text-sm">{{ props.notification.payload?.alertTitle }}</span>
      <span
        v-if="props.notification.payload?.severity"
        class="notif-severity-badge"
        :class="`severity-${props.notification.payload.severity}`"
      >
        {{ props.notification.payload.severity }}
      </span>
    </div>
    <p v-if="props.notification.payload?.message" class="text-xs" style="color: var(--va-secondary)">
      {{ props.notification.payload.message }}
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
.notif-severity-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: capitalize;
}

.severity-critical {
  background: rgba(228, 34, 34, 0.12);
  color: var(--va-danger);
}

.severity-warning {
  background: rgba(255, 212, 58, 0.12);
  color: #b38600;
}

.dark .severity-warning {
  color: var(--va-warning);
}

.severity-info {
  background: rgba(21, 141, 227, 0.12);
  color: var(--va-info);
}

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
