import notificationService from "@/services/notification";
import { defineStore } from "pinia";
import toast from "@/services/toast";

export const useNotificationStore = defineStore("notification", () => {
  const loading = ref(false);
  const appNotifications = ref([]);
  const unreadCount = ref(0);
  const filters = ref({
    read: false,
    archived: false,
    bookmarked: null,
    globallyDismissed: false,
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
    filters.value = {
      ...filters.value,
      [key]: value,
    };
  }

  function clearFilters() {
    filters.value = {
      read: false,
      archived: false,
      bookmarked: null,
      globallyDismissed: false,
      search: "",
    };
  }

  function fetchUnreadCount({ forSelf = false, username = null } = {}) {
    if (forSelf && !username) {
      unreadCount.value = 0;
      return Promise.resolve();
    }
    return notificationService
      .getNotifications({
        forSelf,
        username,
        read: false,
        archived: false,
        bookmarked: null,
        globally_dismissed: false,
        search: null,
      })
      .then((res) => {
        unreadCount.value = Array.isArray(res.data) ? res.data.length : 0;
      })
      .catch(() => {
        unreadCount.value = 0;
      });
  }

  function fetchNotifications({ forSelf = false, username = null } = {}) {
    if (forSelf && !username) {
      setNotifications([]);
      return Promise.resolve();
    }
    loading.value = true;
    return notificationService
      .getNotifications({
        forSelf,
        username,
        read: filters.value.read,
        archived: filters.value.archived,
        bookmarked: filters.value.bookmarked,
        globally_dismissed: filters.value.globallyDismissed,
        // Search is applied client-side in the dropdown to avoid focus loss
        // caused by request-driven rerenders while typing.
        search: null,
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

  function refreshNotifications({ forSelf = false, username = null } = {}) {
    return Promise.all([
      fetchNotifications({ forSelf, username }),
      fetchUnreadCount({ forSelf, username }),
    ]);
  }

  function updateNotificationState(
    id,
    data,
    { forSelf = false, username = null } = {},
  ) {
    if (forSelf && !username) {
      return Promise.resolve();
    }
    loading.value = true;
    return notificationService
      .updateNotificationState(id, data, { forSelf, username })
      .then(() => refreshNotifications({ forSelf, username }))
      .catch((error) => {
        if (error?.response?.status === 409) {
          toast.error(
            "Notification was globally dismissed and is no longer actionable.",
          );
          return refreshNotifications({ forSelf, username });
        }
        toast.error("Could not update notification state.");
      })
      .finally(() => {
        loading.value = false;
      });
  }

  function markAllRead({ forSelf = false, username = null } = {}) {
    if (forSelf && !username) {
      return Promise.resolve();
    }
    loading.value = true;
    return notificationService
      .markAllRead({ forSelf, username })
      .then((res) => {
        const updatedCount = res?.data?.updated_count ?? 0;
        if (updatedCount > 0) {
          toast.success(`Marked ${updatedCount} notifications as read.`);
        } else {
          toast.info("No unread notifications to mark as read.");
        }
        return refreshNotifications({ forSelf, username });
      })
      .catch(() => {
        toast.error("Could not mark all notifications as read.");
      })
      .finally(() => {
        loading.value = false;
      });
  }

  function dismissNotificationGlobally(
    id,
    { forSelf = false, username = null } = {},
  ) {
    if (forSelf && !username) {
      return Promise.resolve();
    }
    loading.value = true;
    return notificationService
      .dismissNotificationGlobally(id)
      .then(() => refreshNotifications({ forSelf, username }))
      .catch((error) => {
        if (error?.response?.status === 409) {
          toast.error("Notification is already globally dismissed.");
          return refreshNotifications({ forSelf, username });
        }
        if (error?.response?.status === 403) {
          toast.error(
            "You are not allowed to globally dismiss this notification.",
          );
          return;
        }
        toast.error("Could not globally dismiss notification.");
      })
      .finally(() => {
        loading.value = false;
      });
  }

  return {
    notifications,
    unreadCount,
    filters,
    addNotification,
    removeNotification,
    fetchNotifications,
    fetchUnreadCount,
    refreshNotifications,
    updateNotificationState,
    markAllRead,
    dismissNotificationGlobally,
    setFilter,
    clearFilters,
    loading,
  };
});
