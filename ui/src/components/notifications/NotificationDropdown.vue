<template>
  <va-menu placement="left-bottom">
    <template #anchor>
      <va-badge
        :offset="[-3, 10]"
        :text="`${notifications.length > 0 ? notifications.length : ''}`"
        overlap
      >
        <va-button class="notification-bell" plain>
          <Icon icon="mdi-bell-outline" height="36px" width="36px" />
        </va-button>
      </va-badge>
    </template>

    <div class="max-w-md">
      <va-menu-item v-if="notifications.length === 0">
        No pending notifications
      </va-menu-item>

      <va-menu-item
        v-else
        v-for="(notification, index) in notifications"
        :key="index"
      >
        <notification :notification="notification"></notification>
        <va-divider />
      </va-menu-item>
    </div>
  </va-menu>
  <!-- </div> -->
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const notificationStore = useNotificationStore();

const { notifications } = storeToRefs(notificationStore);
const { fetchActiveNotifications } = notificationStore;

// retrieve notifications every 5 seconds
const { resume } = useIntervalFn(fetchActiveNotifications, 5000, {
  immediateCallback: true,
});

onMounted(() => {
  resume();
});
</script>

<style lang="scss" scoped>
.notification-bell {
  color: var(--va-text-primary) !important;
}
</style>
