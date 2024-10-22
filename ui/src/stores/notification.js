import notificationService from "@/services/notification";
import { defineStore } from "pinia";
import toast from "@/services/toast";

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
    loading.value = true;
    return notificationService
      .getNotifications({
        status: "CREATED",
      })
      .then((res) => {
        setNotifications(res.data);
      })
      .catch(() => {
        toast.error("Could not fetch notifications.");
      })
      .finally(() => {
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
