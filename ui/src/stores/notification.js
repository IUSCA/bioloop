import { defineStore } from "pinia";
import datasetService from "@/services/dataset";
import { dayjs } from "@/services/utils";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export const useNotificationStore = defineStore("notification", () => {
  const loading = ref(false);

  const notifications = ref([]);

  const notificationsSorted = computed(() => {
    return notifications.value.sort((n1, n2) =>
      dayjs(n1.created_at).diff(dayjs(n2.created_at)),
    );
  });

  function addNotification(notification) {
    notifications.value.push(notification);
  }

  function removeNotification(index) {
    notifications.value = notifications.value.splice(index, 1);
  }

  function setNotifications(notificationList) {
    notifications.value = notificationList;
  }

  async function fetchActiveNotifications() {
    let activeNotifications = [
      {
        type: "OTHER_NOTIFICATION",
        label: "Other Notification",
        text: "Some other notification.",
        to: "/rawdata",
        acknowledged: false,
        created_at: "2024-03-14T00:39:46.437Z",
      },
    ];
    const datasetNotifications = await loadDatasetNotifications();
    activeNotifications = activeNotifications.concat(datasetNotifications);
    setNotifications(activeNotifications);
  }

  async function loadDatasetNotifications() {
    const datasetNotificationsResponse =
      await datasetService.getDuplicateReports({
        type: "DUPLICATE_INGESTION",
      });
    const datasetDuplicateReports = datasetNotificationsResponse.data;
    const unresolvedDatasetDuplicateReports = (
      datasetDuplicateReports || []
    ).filter((report) => report.active);
    return unresolvedDatasetDuplicateReports.length > 0
      ? [
          {
            type: "DUPLICATE_INGESTION",
            label: "Duplicate Ingestion",
            text: "Duplicate dataset ingestions have been detected. Click here to resolve.",
            to: "/duplicateDatasets",
            acknowledged: false,
            created_at: dayjs.utc().format(),
            onClick: () => {
              removeNotification(
                notifications.value.findIndex(
                  (n) => n.type === "DUPLICATE_INGESTION",
                ),
              );
            },
          },
        ]
      : [];
  }

  // function $reset() {
  // }

  return {
    notifications: notificationsSorted,
    addNotification,
    removeNotification,
    fetchActiveNotifications,
  };
});
