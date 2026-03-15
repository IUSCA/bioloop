import notificationService from "@/services/notification";
import { defineStore } from "pinia";
import toast from "@/services/toast";

export const useNotificationStore = defineStore("notification", () => {
  const loading = ref(false);
  const appNotifications = ref([]);
  const filters = ref({
    read: null,
    archived: false,
    bookmarked: null,
    search: "",
  });
  const notifications = computed(() => appNotifications.value);

  function addNotification(notification) {
    appNotifications.value.push(notification);
  }

  function removeNotification(index) {
    appNotifications.value = appNotifications.value.splice(index, 1);
  }

  function setNotifications(notificationList) {
    appNotifications.value = notificationList;
  }

  function setFilter(key, value) {
    filters.value[key] = value;
  }

  function clearFilters() {
    filters.value.read = null;
    filters.value.archived = false;
    filters.value.bookmarked = null;
    filters.value.search = "";
  }

  function fetchNotifications() {
    loading.value = true;
    return notificationService
      .getNotifications({
        read: filters.value.read,
        archived: filters.value.archived,
        bookmarked: filters.value.bookmarked,
        search: filters.value.search || null,
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

  function updateNotificationState(id, data) {
    return notificationService
      .updateNotificationState(id, data)
      .then(() => fetchNotifications())
      .catch(() => {
        toast.error("Could not update notification state.");
      });
  }

  return {
    notifications,
    filters,
    addNotification,
    removeNotification,
    fetchNotifications,
    updateNotificationState,
    setFilter,
    clearFilters,
    loading,
  };
});
