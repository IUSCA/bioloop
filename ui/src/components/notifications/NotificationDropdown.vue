<template>
  <va-inner-loading>
    <va-menu placement="left-bottom">
      <template #anchor>
        <va-badge
          :offset="[-3, 10]"
          :text="`${notifications.length > 0 ? notifications.length : ''}`"
          overlap
          data-testid="notification-count"
        >
          <va-button
            data-testid="notification-icon"
            class="notification-bell"
            plain
          >
            <Icon icon="mdi-bell-outline" height="36px" width="36px" />
          </va-button>
        </va-badge>
      </template>

      <div class="max-w-md max-h-96" data-testid="notification-menu-items">
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
  </va-inner-loading>
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";
import config from "@/config";

const notificationStore = useNotificationStore();

const { notifications } = storeToRefs(notificationStore);
const { fetchActiveNotifications } = notificationStore;

// retrieve notifications every 5 seconds
const { resume } = useIntervalFn(
  fetchActiveNotifications,
  config.notifications.pollingInterval,
  {
    immediateCallback: true,
  },
);

onMounted(() => {
  resume();
});

const open = ref(true);
</script>

<style lang="scss" scoped>
.notification-bell {
  color: var(--va-text-primary) !important;
}
</style>
