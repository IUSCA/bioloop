<template>
  <div class="flex flex-col gap-1">
    <p v-if="props.notification.payload?.message" class="text-sm" style="color: var(--va-secondary)">
      {{ props.notification.payload.message }}
    </p>
    <a
      v-if="props.notification.payload?.actionUrl"
      :href="props.notification.payload.actionUrl"
      class="notif-action-link"
      target="_blank"
      rel="noopener"
    >
      {{ props.notification.payload.actionLabel || "Learn more" }}
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
