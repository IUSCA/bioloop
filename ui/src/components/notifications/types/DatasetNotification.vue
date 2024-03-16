<template>
  <a
    class="notification-anchor"
    :href="_notification.to || '#'"
    @click="_notification.onClick"
  >
    <h6 class="va-h6">{{ _notification.label }}</h6>
    <p>{{ _notification.text }}</p>
  </a>
</template>

<script setup>
import notificationService from "@/services/notification";

const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});

const actionItem = computed(() => {
  return props.notification.dataset_action_items[0]
})

const _notification = computed(() => ({
  ...props.notification,
  to: `/datasets/${actionItem.dataset_id}/actionItems/${actionItem.id}`,
  onClick: () => {
    // change status of notification to ACK'd
    return notificationService.updateNotificationStatus({
      notification_id: props.notification.id,
      status: "ACKNOWLEDGED",
    });
  },
}));
</script>

<style lang="scss" scoped>
.notification-anchor {
  color: var(--va-text-primary);
}
</style>
