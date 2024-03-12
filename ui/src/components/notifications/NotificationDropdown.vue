<template>
  <va-menu placement="left-bottom">
    <template #anchor>
      <va-badge text="1" overlap :offset="[-3, 10]">
        <va-button class="notification-bell" plain>
          <Icon icon="mdi-bell-outline" height="36px" width="36px" />
        </va-button>
      </va-badge>
    </template>

    <va-menu-item v-for="(notification, index) in notifications" :key="index">
      <notification :notification="notification"></notification>
      <va-divider />
    </va-menu-item>
  </va-menu>
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";

const notifications = ref([]);

const notificationStore = useNotificationStore();
// subscribe to notification store, so that the list of notifications shown to the user
// automatically updates when a notification is added to the store by an external component.
notificationStore.$subscribe((mutation, state) => {
  notifications.value = state.notifications;
});

setTimeout(() => {
  notifications.value = notificationStore.notifications;
}, 1000);
</script>

<style lang="scss" scoped>
.notification-bell {
  color: var(--va-text-primary) !important;
}
</style>
