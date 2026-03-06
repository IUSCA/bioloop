import notificationService from "@/services/notification";
import toast from "@/services/toast";
import { acceptHMRUpdate, defineStore } from "pinia";

export const useNotificationStore = defineStore("notification", () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const notifications = ref([]);
  const unreadCount = ref(0);
  const totalCount = ref(0);
  const page = ref(1);
  const limit = ref(20);
  const loading = ref(false);

  /** @type {import('vue').Ref<EventSource|null>} */
  const sseConnection = ref(null);

  // ── SSE lifecycle ──────────────────────────────────────────────────────────

  function connect() {
    if (sseConnection.value) return; // already open

    const es = notificationService.openStream();

    es.addEventListener("ping", () => {
      // SSE handshake confirmed – nothing to do
    });

    es.addEventListener("notification", (event) => {
      try {
        const notification = JSON.parse(event.data);
        notifications.value.unshift(notification);
        unreadCount.value += 1;
      } catch {
        // malformed data — ignore
      }
    });

    es.onerror = () => {
      // Browser will auto-reconnect; nothing extra needed here
    };

    sseConnection.value = es;
  }

  function disconnect() {
    if (sseConnection.value) {
      sseConnection.value.close();
      sseConnection.value = null;
    }
  }

  // ── REST actions ───────────────────────────────────────────────────────────

  async function fetchPage(newPage = 1, newLimit = 20) {
    loading.value = true;
    try {
      const res = await notificationService.getPage({
        page: newPage,
        limit: newLimit,
      });
      const { data, metadata } = res.data;
      notifications.value = data;
      totalCount.value = metadata.total;
      page.value = metadata.page;
      limit.value = metadata.limit;
    } catch (err) {
      console.error("Could not fetch notifications.", err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchUnreadCount() {
    try {
      const res = await notificationService.getUnreadCount();
      unreadCount.value = res.data.count;
    } catch {
      // non-critical — silently ignore
    }
  }

  async function markRead(id) {
    try {
      await notificationService.markRead(id);
      const target = notifications.value.find((n) => n.id === id);
      if (target && !target.is_read) {
        target.is_read = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    } catch {
      toast.error("Could not mark notification as read.");
    }
  }

  async function markAllRead() {
    try {
      await notificationService.markAllRead();
      notifications.value.forEach((n) => {
        n.is_read = true;
      });
      unreadCount.value = 0;
    } catch {
      toast.error("Could not mark all notifications as read.");
    }
  }

  async function deleteNotification(id) {
    try {
      await notificationService.deleteNotification(id);
      const idx = notifications.value.findIndex((n) => n.id === id);
      if (idx !== -1) {
        const wasUnread = !notifications.value[idx].is_read;
        notifications.value.splice(idx, 1);
        if (wasUnread) unreadCount.value = Math.max(0, unreadCount.value - 1);
        totalCount.value = Math.max(0, totalCount.value - 1);
      }
    } catch {
      toast.error("Could not delete notification.");
    }
  }

  return {
    notifications,
    unreadCount,
    totalCount,
    page,
    limit,
    loading,
    connect,
    disconnect,
    fetchPage,
    fetchUnreadCount,
    markRead,
    markAllRead,
    deleteNotification,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(
    acceptHMRUpdate(useNotificationStore, import.meta.hot),
  );
