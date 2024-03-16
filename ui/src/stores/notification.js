import notificationService from "@/services/notification";
import { defineStore } from "pinia";

export const useNotificationStore = defineStore("notification", () => {
  const loading = ref(false);
  const appNotifications = ref([]);
  // expose sorted notifications
  const notifications = computed(() => {
    return appNotifications.value;
    // .sort((n1, n2) =>
    //   dayjs(n2.created_at).diff(dayjs(n1.created_at)),
    // );
  });

  function addNotification(notification) {
    // console.log("add notification");
    // console.log("before add notification");
    // console.log(appNotifications.value);
    appNotifications.value.push(notification);
    // console.log("after add notification");
    // console.log(appNotifications.value);
  }

  function removeNotification(index) {
    appNotifications.value = appNotifications.value.splice(index, 1);
  }

  function setNotifications(notificationList) {
    // console.log("set notifications");
    // console.log(notificationList);
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
