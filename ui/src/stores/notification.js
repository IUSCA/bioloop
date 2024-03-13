import { defineStore } from "pinia";
import notificationService from "@/services/notification";
import { dayjs } from "@/services/utils";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export const useNotificationStore = defineStore("notification", () => {
  const loading = ref(false);
  const appNotifications = ref([]);
  // expose sorted notifications
  const notifications = computed(() => {
    return appNotifications.value.sort((n1, n2) =>
      dayjs(n1.created_at).diff(dayjs(n2.created_at)),
    );
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
    let activeNotifications = [
      // {
      //   type: "OTHER_NOTIFICATION",
      //   label: "Other Notification",
      //   text: "Some other notification.",
      //   to: "/rawdata",
      //   acknowledged: false,
      //   created_at: "2024-03-14T00:39:46.437Z",
      // },
    ];
    loadNotifications().then((notificationsList) => {
      activeNotifications = activeNotifications.concat(notificationsList);
      setNotifications(notificationsList);
      loading.value = false;
    });
  }

  async function loadNotifications() {
    // todo - get notifications whose status is CREATED || ACK, and whose corresponding
    //  action item has not been resolved.
    return notificationService.getNotifications().then((res) => {
      return res.data.map((notification) => {
        if (notification.type === "DATASET") {
          return configureDatasetNotification(notification);
        }
        /**
         * configure other notification types here
         */
      });
    });
  }

  function configureDatasetNotification(notification) {
    return {
      ...notification,
      to: `/duplicateDatasets/${notification.dataset_action_items[0].id}`,
      onClick: () => {
        // change status of notification to ACK'd
        return notificationService.updateNotificationStatus({
          notification_id: notification.id,
          status: "ACKNOWLEDGED",
        });
      },
    };
  }

  return {
    notifications,
    addNotification,
    removeNotification,
    fetchActiveNotifications,
    loading,
  };
});
