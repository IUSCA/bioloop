import { defineStore } from "pinia";
import datasetService from "@/services/dataset";
import { dayjs } from "@/services/utils";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export const useNotificationStore = defineStore("notification", () => {
  const notifications = ref([]);

  function addNotification(notification) {
    notifications.value.push(notification);
  }

  function removeNotification(notification) {
    notifications.value = notifications.value.filter((n) => n !== notification);
  }

  function setNotifications(notificationList) {
    console.log("setNotifications");
    console.dir(notificationList, { depth: null });
    notifications.value = notificationList;
  }

  async function fetchActiveNotifications() {
    let appNotifications = [
      {
        type: "OTHER_NOTIFICATION",
        label: "Other Notification",
        text: "Some other notification.",
        to: "/ingestionManager",
        acknowledged: false,
        created_at: "2024-03-14T00:39:46.437Z",
      },
    ];
    const datasetNotifications = await loadDatasetNotifications();
    console.log("datasetNotifications");
    console.dir(datasetNotifications, { depth: null });
    appNotifications = appNotifications.concat(datasetNotifications);
    console.log("appNotifications");
    console.dir(appNotifications, { depth: null });
    // sort appNotifications by timestamp
    appNotifications.sort((n1, n2) =>
      dayjs(n1.created_at).diff(dayjs(n2.created_at)),
    );
    console.log("appNotifications");
    console.dir(appNotifications, { depth: null });
    setNotifications(appNotifications);
  }

  async function loadDatasetNotifications() {
    const datasetNotificationsResponse = await datasetService.getActionItems({
      type: "DUPLICATE_INGESTION",
    });
    const datasetActionItems = datasetNotificationsResponse.data;
    console.log("datasetActionItems");
    console.dir(datasetActionItems, { depth: null });
    const unresolvedDatasetActionItems = (datasetActionItems || []).filter(
      (actionItem) => actionItem.active,
    );
    return unresolvedDatasetActionItems.length > 0
      ? [
          {
            type: "DUPLICATE_INGESTION",
            label: "Duplicate Ingestion",
            text: "Duplicate dataset ingestions have been detected. Click here to resolve.",
            to: "/ingestionManager",
            acknowledged: false,
            created_at: dayjs.utc().format(),
          },
        ]
      : [];
  }

  // function $reset() {
  // }

  return {
    notifications,
    addNotification,
    removeNotification,
    fetchActiveNotifications,
  };
});
