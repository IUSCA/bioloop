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
