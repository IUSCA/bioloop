<template>
  <va-menu placement="left-bottom">
    <template #anchor>
      <va-badge text="1" overlap :offset="[-3, 3]">
        <va-button plain color="primary">
          <Icon icon="mdi-bell" height="24px" width="24px" />
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

const notificationStore = useNotificationStore();

const notifications = notificationStore.notifications;
</script>

<style scoped></style>
