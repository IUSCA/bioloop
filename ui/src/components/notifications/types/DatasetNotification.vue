<template>
  <a
    class="notification-anchor"
    :href="_notification.to || '#'"
    @click="_notification.onClick"
    :data-testid="`notification-${notification.id}-anchor`"
  >
    <h6 class="va-h6">{{ _notification.label }}</h6>
    <p>{{ _notification.text }}</p>
  </a>
</template>

<script setup>
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});

const actionItem = computed(() => {
  return props.notification.dataset_action_items[0];
});

const _notification = computed(() => ({
  ...props.notification,
  to: `/datasets/${actionItem.value.dataset_id}/actionItems/${actionItem.value.id}`,
}));
</script>

<style lang="scss" scoped>
.notification-anchor {
  color: var(--va-text-primary);
}
</style>
