import { defineStore } from "pinia";
import datasetService from "@/services/dataset";

export const useNotificationStore = defineStore("notification", () => {
  const notifications = ref([
    {
      type: "DUPLICATE_INGESTION",
      label: "Duplicate Ingestion",
      text: "Duplicate ingestions have been detected. Click here to resolve.",
      to: "/ingestionManager",
      acknowledged: false,
    },
    {
      type: "OTHER_NOTIFICATION",
      label: "Other Notification",
      text: "Some other notification.",
      to: "/ingestionManager",
      acknowledged: false,
    },
  ]);

  function addNotification(notification) {
    notifications.value.push(notification);
  }

  function removeNotification(notification) {
    notifications.value = notifications.value.filter((n) => n !== notification);
  }

  async function loadNotifications() {
    const datasetActionItems = await datasetService.getActionItems({
      type: "DUPLICATE_INGESTION",
    });
    const unresolvedDatasetActionItems = datasetActionItems.filter(
      (actionItem) => !actionItem.active,
    );

    if (unresolvedDatasetActionItems.length > 0) {
      addNotification({
        type: "DUPLICATE_INGESTION",
        label: "Duplicate Ingestion",
        text: "Duplicate ingestions have been detected. Click here to resolve.",
        to: "/ingestionManager",
        acknowledged: false,
      });
    }
    // notifications.value = notifications.value.concat(
    //   datasetActionItems.map((actionItem) => ()),
    // );
  }

  // function $reset() {
  // }

  return {
    notifications,
    addNotification,
    removeNotification,
  };
});
