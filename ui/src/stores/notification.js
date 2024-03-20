import notificationService from "@/services/notification";
import { defineStore } from "pinia";

export const useNotificationStore = defineStore("notification", () => {
  const loading = ref(false);
  const appNotifications = ref([]);
  // expose sorted notifications
  const notifications = computed(() => {
    return appNotifications.value;
  });

  function addNotification(notification) {
    appNotifications.value.push(notification);
  }

  function removeNotification(index) {
    appNotifications.value = appNotifications.value.splice(index, 1);
  }

  function setNotifications(notificationList) {
    appNotifications.value = notificationList;
  }

  function fetchActiveNotifications() {
    // todo - get notifications whose status is CREATED || ACK, and whose corresponding
    //  action item has not been resolved.
    return notificationService.getNotifications().then((res) => {
      setNotifications(res.data);
      loading.value = false;
    });
  }

  return {
    notifications,
    addNotification,
    removeNotification,
    fetchActiveNotifications,
    loading,
  };
});
