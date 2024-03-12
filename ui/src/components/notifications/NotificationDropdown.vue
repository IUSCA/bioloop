<template>
  <va-menu placement="left-bottom">
    <template #anchor>
      <va-badge :offset="[-3, 10]" :text="`${notifications.length}`" overlap>
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
import { storeToRefs } from "pinia";
import { useNotificationStore } from "@/stores/notification";

const notificationStore = useNotificationStore();

const { notifications } = storeToRefs(notificationStore);
const { fetchActiveNotifications } = notificationStore;

// const loading = ref(false);

// debugger;

// subscribe to notification store, so that the list of notifications shown to the user
// automatically updates when a notification is added to the store by an external component.

// onMounted(() => {
//   setInterval(() => {
//     testStore.increment();
//   }, 1000);
// });
//
// testStore.$subscribe((mutation, state) => {
//   console.log("inside testStore $subscribe");
//   console.log(state.count);
// });

onMounted(() => {
  // setTimeout(() => {
  //   notificationStore.addNotification({
  //     type: "CUSTOM_NOTIFICATION",
  //     label: "Custom Notification",
  //     text: "Some other notification.",
  //     to: "/rawdata",
  //     acknowledged: false,
  //     created_at: "2024-03-14T00:39:46.437Z",
  //   });
  //
  //   // notificationStore.increment();
  //   // notificationStore.appendToList({
  //   //   key: "value",
  //   // });
  // }, 1000);
  fetchActiveNotifications();
});

// notificationStore.$subscribe((mutation, state) => {
//   console.log("inside notificationStore $subscribe");
//   notifications.value = state.notifications;
//   // loading.value = state.loading;
//   // console.log(`loading: ${state.loading}`);
//   console.log(`notifications:`);
//   console.dir(state.notifications, { depth: null });
// });

watch(notifications, () => {
  console.log("watch");
  console.log(notifications);
});
</script>

<style lang="scss" scoped>
.notification-bell {
  color: var(--va-text-primary) !important;
}
</style>
