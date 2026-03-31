<template>
  <va-inner-loading>
    <va-menu placement="left-bottom">
      <template #anchor>
        <va-badge
          :offset="[-3, 10]"
          :text="`${notifications.length > 0 ? notifications.length : ''}`"
          overlap
          data-testid="notification-count"
        >
          <va-button
            data-testid="notification-icon"
            class="notification-bell"
            plain
          >
            <Icon icon="mdi-bell-outline" height="36px" width="36px" />
          </va-button>
        </va-badge>
      </template>

      <div class="max-w-md max-h-96" data-testid="notification-menu-items">
        <va-menu-item v-if="notifications.length === 0">
          No pending notifications
        </va-menu-item>

        <va-menu-item
          v-else
          v-for="(notification, index) in notifications"
          :key="index"
        >
          <notification :notification="notification"></notification>
          <va-divider />
        </va-menu-item>
      </div>
    </div>
  </div>
</template>

<script setup>
import config from "@/config";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const notificationStore = useNotificationStore();
const auth = useAuthStore();
const { canOperate, user: authUser } = storeToRefs(auth);
const forSelf = computed(
  () => !viewerHasPrivilegedNotificationAccess(canOperate.value),
);
const notificationQueryOpts = computed(() => ({
  forSelf: forSelf.value,
  username: authUser.value?.username || null,
}));

const {
  notifications,
  filters,
  unreadCount,
  listFetching,
  mutationPending,
  totalMatchedCount,
  hasMoreNotifications,
} = storeToRefs(notificationStore);
const {
  refreshNotifications,
  fetchNotifications,
  fetchMoreNotifications,
  updateNotificationState,
  markAllRead,
  setFilter,
  clearFilters,
} = notificationStore;
const searchInput = computed({
  get() {
    return filters.value.search || "";
  },
  set(val) {
    const next = val == null ? "" : String(val);
    setFilter("search", next);
  },
});
const isSearchFocused = ref(false);
const isMenuOpen = ref(false);
const dropdownRootRef = ref(null);
const menuPanelRef = ref(null);
const suppressAnchorClickUntilMs = ref(0);
const firstTopControlRef = ref(null);
const notificationOpenButtonRef = ref(null);
const displayedNotifications = computed(() => notifications.value);
const isUnreadFilterActive = computed(() => filters.value.read === false);
const isReadFilterActive = computed(() => filters.value.read === true);
const isBookmarkedFilterActive = computed(
  () => filters.value.bookmarked === true,
);
const controlsDisabled = computed(
  () => listFetching.value || mutationPending.value,
);

const hasActiveFilters = computed(() => {
  return (
    isReadFilterActive.value ||
    isBookmarkedFilterActive.value ||
    Boolean((filters.value.search || "").trim())
  );
});
const badgeCount = computed(() => {
  if (hasActiveFilters.value) {
    return totalMatchedCount.value;
  }
  return unreadCount.value;
});
const hasActiveFilterChips = computed(() => {
  return isReadFilterActive.value || isBookmarkedFilterActive.value;
});
function onSearchInputClick(event) {
  const target = event?.target;
  if (!target || typeof target.closest !== "function") return;
  if (target.closest('[aria-label="reset"]')) {
    clearSearchFilter();
  }
}

function focusableControl(el) {
  if (!(el instanceof HTMLElement)) return null;
  if (
    el.matches(
      "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    )
  ) {
    return el;
  }
  return el.querySelector(
    "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
  );
}

/**
 * Move focus into the dialog after Vue commits the open state and the browser
 * paints. Uses nextTick + double rAF (layout/paint after DOM update) instead of
 * timed retries so behavior stays deterministic.
 */
function focusFirstMenuControlSoon() {
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const panel =
            menuPanelRef.value instanceof HTMLElement
              ? menuPanelRef.value
              : null;
          if (!(panel && panel.offsetParent !== null)) return;
          if (!panel.contains(document.activeElement)) {
            panel.focus();
          }
          const anchor =
            panel.querySelector("[data-notification-menu-initial-focus]") ||
            panel.querySelector('[data-testid="filter-unread"]') ||
            panel.querySelector('[data-testid="filter-read"]') ||
            panel.querySelector('[data-testid="filter-bookmarked"]') ||
            panel.querySelector('[data-testid="clear-notification-filters"]') ||
            panel.querySelector('[data-testid="notification-search"]') ||
            (firstTopControlRef.value?.$el instanceof HTMLElement
              ? firstTopControlRef.value.$el
              : null);
          const node =
            focusableControl(anchor) ||
            panel.querySelector(
              "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
            );
          if (node instanceof HTMLElement && node.offsetParent !== null) {
            node.focus();
          }
        });
      });
    });
  });
}

function toggleNotificationMenu() {
  if (Date.now() < suppressAnchorClickUntilMs.value) {
    return;
  }
  if (isMenuOpen.value) return;
  isMenuOpen.value = true;
  focusFirstMenuControlSoon();
}

function openNotificationMenuFromKeyboard() {
  suppressAnchorClickUntilMs.value = Date.now() + 250;
  isMenuOpen.value = true;
  focusFirstMenuControlSoon();
}

function closeNotificationMenu() {
  if (!isMenuOpen.value) return;
  isMenuOpen.value = false;
  const button =
    focusableControl(notificationOpenButtonRef.value?.$el) ||
    (notificationOpenButtonRef.value?.$el instanceof HTMLElement
      ? notificationOpenButtonRef.value.$el
      : null);
  if (button instanceof HTMLElement) {
    button.focus();
  }
}

function onSearchFocus() {
  isSearchFocused.value = true;
}

function onSearchInputKeydown() {}

function onSearchShiftTab() {
  const panel =
    menuPanelRef.value instanceof HTMLElement ? menuPanelRef.value : null;
  if (!panel) return;
  const chipClears = Array.from(
    panel.querySelectorAll(
      '[data-testid^="active-filter-chip-"][data-testid$="-clear"]',
    ),
  ).filter(
    (node) =>
      node instanceof HTMLElement &&
      node.offsetParent !== null &&
      !node.hasAttribute("disabled"),
  );
  if (chipClears.length > 0) {
    chipClears[chipClears.length - 1].focus();
    return;
  }
  const clearAll = panel.querySelector(
    '[data-testid="clear-notification-filters"]',
  );
  if (
    clearAll instanceof HTMLElement &&
    clearAll.offsetParent !== null &&
    !clearAll.hasAttribute("disabled")
  ) {
    clearAll.focus();
  }
}

function onSearchBlur() {
  isSearchFocused.value = false;
}

function clearSearchFilter() {
  setFilter("search", "");
  fetchNotifications(notificationQueryOpts.value);
}

const triggerSearchFetch = useDebounceFn(() => {
  fetchNotifications(notificationQueryOpts.value);
}, 250);

watch(
  () => filters.value.search,
  () => {
    triggerSearchFetch();
  },
);

/**
 * List GET or mutating request in flight; omits search debounce so aria-busy does not stick between keystroke and
 * fetch.
 */
const notificationMenuBusy = computed(() =>
  Boolean(listFetching.value || mutationPending.value),
);

function onMenuScroll(event) {
  const panel = event?.target;
  if (!(panel instanceof HTMLElement)) return;
  if (!hasMoreNotifications.value || listFetching.value) return;
  const nearBottom =
    panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80;
  if (!nearBottom) return;
  fetchMoreNotifications(notificationQueryOpts.value);
}

function applyReadFilter(value) {
  setFilter("read", value);
}

function toggleUnreadFilter() {
  applyReadFilter(false);
  fetchNotifications(notificationQueryOpts.value);
}

function toggleReadFilter() {
  const nextValue = filters.value.read === true ? false : true;
  applyReadFilter(nextValue);
  fetchNotifications(notificationQueryOpts.value);
}

function clearReadFilter() {
  applyReadFilter(false);
  fetchNotifications(notificationQueryOpts.value);
}

function toggleBookmarkedFilter() {
  const nextValue = filters.value.bookmarked === true ? null : true;
  setFilter("bookmarked", nextValue);
  fetchNotifications(notificationQueryOpts.value);
}

function clearBookmarkedFilter() {
  setFilter("bookmarked", null);
  fetchNotifications(notificationQueryOpts.value);
}

function handleClearFilters() {
  clearFilters();
  fetchNotifications(notificationQueryOpts.value);
}

function onToggleRead(notification) {
  updateNotificationState(
    notification.id,
    {
      is_read: !notification.state.is_read,
    },
    notificationQueryOpts.value,
  );
}

function onToggleBookmarked(notification) {
  updateNotificationState(
    notification.id,
    {
      is_bookmarked: !notification.state.is_bookmarked,
    },
    notificationQueryOpts.value,
  );
}

function onMarkAllRead() {
  markAllRead(notificationQueryOpts.value);
}

const { resume } = useIntervalFn(
  () => {
    if (isSearchFocused.value) return;
    refreshNotifications(notificationQueryOpts.value);
  },
  config.notifications.pollingInterval,
  {
    immediateCallback: true,
  },
);

onMounted(() => {
  onClickOutside(dropdownRootRef, () => {
    closeNotificationMenu();
  });
  useEventListener(document, "keydown", (event) => {
    if (event.key !== "Escape") return;
    closeNotificationMenu();
  });
  resume();
});
</script>

<style lang="scss" scoped>
.notification-open-button {
  color: var(--va-text-primary) !important;
}

.notification-dropdown-root {
  display: inline-flex;
}

.notification-top-controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  width: 100%;
  padding-bottom: 0.125rem;
}

.notification-top-control-button {
  width: 100%;
}

.notification-search-input {
  width: 100%;
}

.notification-clear-filters-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--va-background-border);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--va-secondary);
  padding: 0.25rem 0.375rem;
}

.notification-clear-filters-button:disabled {
  opacity: 0.9;
  cursor: default;
}

.notification-clear-filters-button:focus,
.notification-clear-filters-button:focus-visible {
  outline: 2px solid var(--va-primary);
  outline-offset: 2px;
}

.notification-top-control-button :deep(.va-button__content) {
  justify-content: center;
}

/* Keep menu width deterministic per app breakpoint thresholds from ui/vuestic.config.js */
.notification-menu-panel {
  background: var(--va-background-element);
  width: min(22rem, calc(100vw - 1rem));
  min-width: min(22rem, calc(100vw - 1rem));
  max-width: min(22rem, calc(100vw - 1rem));
}

.notification-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 4999;
  background: color-mix(in srgb, var(--va-background-primary) 64%, transparent);
}

.notification-menu-panel--anchored {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 5000;
}

@media (min-width: 640px) {
  .notification-menu-panel {
    width: 28rem;
    min-width: 28rem;
    max-width: 28rem;
  }
}

@media (max-width: 768px) {
  .notification-top-controls {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .notification-menu-panel {
    width: 32rem;
    min-width: 32rem;
    max-width: 32rem;
  }
}

@media (min-width: 1024px) {
  .notification-menu-panel {
    width: 36rem;
    min-width: 36rem;
    max-width: 36rem;
  }
}

.notification-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid currentColor;
  border-radius: 9999px;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.notification-filter-chip__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.notification-filter-chip__clear:focus,
.notification-filter-chip__clear:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  border-radius: 9999px;
}

.notification-filter-chip__clear:disabled {
  opacity: 0.9;
  cursor: default;
}

.notification-top-control-button:deep(.va-button--disabled),
.notification-search-input:deep(.va-input-wrapper--disabled) {
  opacity: 0.92;
}

.notification-filter-chip--primary {
  color: var(--va-primary);
}

.notification-filter-chip--info {
  color: var(--va-info);
}

.notification-filter-chip--success {
  color: var(--va-success);
}

.notification-filter-chip--warning {
  color: var(--va-warning);
}

.notification-filter-chip--danger {
  color: var(--va-danger);
}

.notification-filter-chip--secondary {
  color: var(--va-text-secondary);
}
</style>
