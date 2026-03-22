import notificationService from "@/services/notifications/client";
import { defineStore } from "pinia";
import toast from "@/services/toast";

/**
 * Pinia store for notification state, filters, pagination, and API interactions.
 *
 * Key design decisions:
 * - `fetchRequestSeq` is a monotonic counter used to discard stale API
 *   responses when rapid filter changes cause out-of-order completions.
 * - `filters` is replaced immutably (spread + assign) so Vue's reactivity
 *   picks up changes without deep-watch overhead and prevents stale DOM
 *   reconciliation issues in the dropdown.
 * - `unreadCount` is fetched separately from the main list so the bell
 *   badge always reflects the true unread total, regardless of active
 *   list filters.
 */
export const useNotificationStore = defineStore("notification", () => {
  const pageSize = 20;
  let fetchRequestSeq = 0;
  /** True while the paginated notification list is being fetched (GET). */
  const listFetching = ref(false);
  /** True while a mutating request runs (state PATCH, mark-all, global dismiss). */
  const mutationPending = ref(false);
  const appNotifications = ref([]);
  const unreadCount = ref(0);
  const totalMatchedCount = ref(0);
  const hasMoreNotifications = ref(false);
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

  /** Removes by index via copy-splice-reassign to trigger Vue reactivity. */
  function removeNotification(index) {
    const copy = [...appNotifications.value];
    copy.splice(index, 1);
    appNotifications.value = copy;
  }

  function setNotifications(notificationList) {
    appNotifications.value = notificationList;
  }

  /** Appends new notifications, deduplicating by id to support infinite scroll. */
  function appendNotifications(notificationList) {
    const existingIds = new Set(appNotifications.value.map((n) => n.id));
    const next = notificationList.filter((n) => !existingIds.has(n.id));
    appNotifications.value = appNotifications.value.concat(next);
  }

  /**
   * Normalizes the API response into `{ items, total, has_more }`.
   * Handles both the current paginated shape and the legacy flat-array shape.
   */
  function getNotificationPagePayload(payload) {
    if (Array.isArray(payload)) {
      return {
        items: payload,
        total: payload.length,
        has_more: false,
      };
    }
    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      total: Number(payload?.total || 0),
      has_more: Boolean(payload?.has_more),
    };
  }

  /** Immutably replaces a single filter key to trigger Vue reactivity cleanly. */
  function setFilter(key, value) {
    const normalized = key === "search" ? (value == null ? "" : String(value)) : value;
    filters.value = {
      ...filters.value,
      [key]: normalized,
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

  /**
   * Fetches the total unread count via a limit-1 query (only the total matters).
   * Always queries with read=false, ignoring active list filters, so the bell
   * badge shows the true unread count.
   */
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
        limit: 1,
        offset: 0,
      })
      .then((res) => {
        const page = getNotificationPagePayload(res.data);
        unreadCount.value = page.total;
      })
      .catch(() => {
        unreadCount.value = 0;
      });
  }

  /**
   * Fetches a page of notifications using current filters.
   * Stale responses (from a superseded request) are silently discarded
   * via the `fetchRequestSeq` monotonic counter.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.forSelf=false]
   * @param {string|null} [opts.username]
   * @param {number} [opts.offset=0] - Pagination offset
   * @param {boolean} [opts.append=false] - Append to existing list (infinite scroll) vs. replace
   */
  function fetchNotifications({
    forSelf = false,
    username = null,
    offset = 0,
    append = false,
  } = {}) {
    if (forSelf && !username) {
      setNotifications([]);
      totalMatchedCount.value = 0;
      hasMoreNotifications.value = false;
      return Promise.resolve();
    }
    const requestSeq = ++fetchRequestSeq;
    listFetching.value = true;
    return notificationService
      .getNotifications({
        forSelf,
        username,
        read: filters.value.read,
        archived: filters.value.archived,
        bookmarked: filters.value.bookmarked,
        globally_dismissed: filters.value.globallyDismissed,
        search: filters.value.search || null,
        limit: pageSize,
        offset,
      })
      .then((res) => {
        if (requestSeq !== fetchRequestSeq) return;
        const page = getNotificationPagePayload(res.data);
        if (append) {
          appendNotifications(page.items);
        } else {
          setNotifications(page.items);
        }
        totalMatchedCount.value = page.total;
        hasMoreNotifications.value = page.has_more;
      })
      .catch(() => {
        if (requestSeq !== fetchRequestSeq) return;
        toast.error("Could not fetch notifications.");
      })
      .finally(() => {
        if (requestSeq !== fetchRequestSeq) return;
        listFetching.value = false;
      });
  }

  /** Loads the next page of notifications (infinite scroll trigger). No-ops if already loading or exhausted. */
  function fetchMoreNotifications({ forSelf = false, username = null } = {}) {
    if (listFetching.value || !hasMoreNotifications.value) return Promise.resolve();
    return fetchNotifications({
      forSelf,
      username,
      offset: appNotifications.value.length,
      append: true,
    });
  }

  /** Re-fetches both the notification list (page 1) and the unread count in parallel. */
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
    mutationPending.value = true;
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
        mutationPending.value = false;
      });
  }

  function markAllRead({ forSelf = false, username = null } = {}) {
    if (forSelf && !username) {
      return Promise.resolve();
    }
    mutationPending.value = true;
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
        mutationPending.value = false;
      });
  }

  function dismissNotificationGlobally(
    id,
    { forSelf = false, username = null } = {},
  ) {
    if (forSelf && !username) {
      return Promise.resolve();
    }
    mutationPending.value = true;
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
        mutationPending.value = false;
      });
  }

  return {
    notifications,
    unreadCount,
    totalMatchedCount,
    hasMoreNotifications,
    filters,
    addNotification,
    removeNotification,
    fetchNotifications,
    fetchMoreNotifications,
    fetchUnreadCount,
    refreshNotifications,
    updateNotificationState,
    markAllRead,
    dismissNotificationGlobally,
    setFilter,
    clearFilters,
    listFetching,
    mutationPending,
  };
});
