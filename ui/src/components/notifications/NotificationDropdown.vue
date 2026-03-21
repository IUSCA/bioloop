<template>
  <va-menu placement="left-bottom" :close-on-content-click="false">
    <template #anchor>
        <va-badge
          :offset="[-3, 10]"
          :text="`${badgeCount > 0 ? badgeCount : ''}`"
          overlap
          data-testid="notification-count"
        >
          <va-button
            ref="notificationOpenButtonRef"
            data-testid="notification-open-button"
            class="notification-open-button"
            plain
            @click="onNotificationOpenActivate"
            @keydown.enter="onNotificationOpenActivate"
            @keydown.space="onNotificationOpenActivate"
          >
            <Icon icon="mdi-bell-outline" height="36px" width="36px" />
          </va-button>
        </va-badge>
    </template>

    <div
      class="notification-menu-panel flex flex-col max-h-96"
      data-testid="notification-menu-items"
    >
      <div
        class="shrink-0 px-3 py-2 border-b relative z-10 bg-[var(--va-background-element)]"
      >
          <div class="notification-top-controls">
            <va-popover message="Unread filter">
              <va-button
                ref="firstTopControlRef"
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="
                  isUnreadFilterActive
                    ? theme.filters.unread.color
                    : 'secondary'
                "
                data-testid="filter-unread"
                aria-label="Unread filter"
                :disabled="mutationPending"
                @click="toggleUnreadFilter"
                @keydown.enter.prevent="toggleUnreadFilter"
                @keydown.space.prevent="toggleUnreadFilter"
              >
                <Icon
                  :icon="
                    isUnreadFilterActive
                      ? theme.filters.unread.iconOn
                      : theme.filters.unread.iconOff
                  "
                />
              </va-button>
            </va-popover>
            <va-popover message="Read filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="
                  isReadFilterActive ? theme.filters.read.color : 'secondary'
                "
                data-testid="filter-read"
                aria-label="Read filter"
                :disabled="mutationPending"
                @click="toggleReadFilter"
                @keydown.enter.prevent="toggleReadFilter"
                @keydown.space.prevent="toggleReadFilter"
              >
                <Icon
                  :icon="
                    isReadFilterActive
                      ? theme.filters.read.iconOn
                      : theme.filters.read.iconOff
                  "
                />
              </va-button>
            </va-popover>
            <va-popover message="Archived filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="
                  isArchivedFilterActive
                    ? theme.filters.archived.color
                    : 'secondary'
                "
                data-testid="filter-archived"
                aria-label="Archived filter"
                :disabled="mutationPending"
                @click="toggleArchivedFilter"
                @keydown.enter.prevent="toggleArchivedFilter"
                @keydown.space.prevent="toggleArchivedFilter"
              >
                <Icon
                  :icon="
                    isArchivedFilterActive
                      ? theme.filters.archived.iconOn
                      : theme.filters.archived.iconOff
                  "
                />
              </va-button>
            </va-popover>
            <va-popover message="Bookmark filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="
                  isBookmarkedFilterActive
                    ? theme.filters.bookmarked.color
                    : 'secondary'
                "
                data-testid="filter-bookmarked"
                aria-label="Bookmark filter"
                :disabled="mutationPending"
                @click="toggleBookmarkedFilter"
                @keydown.enter.prevent="toggleBookmarkedFilter"
                @keydown.space.prevent="toggleBookmarkedFilter"
              >
                <Icon
                  :icon="
                    isBookmarkedFilterActive
                      ? theme.filters.bookmarked.iconOn
                      : theme.filters.bookmarked.iconOff
                  "
                />
              </va-button>
            </va-popover>
            <va-popover message="Globally dismissed filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="
                  isGloballyDismissedFilterActive
                    ? theme.filters.globallyDismissed.color
                    : 'secondary'
                "
                data-testid="filter-globally-dismissed"
                aria-label="Globally dismissed filter"
                :disabled="mutationPending"
                @click="toggleGloballyDismissedFilter"
                @keydown.enter.prevent="toggleGloballyDismissedFilter"
                @keydown.space.prevent="toggleGloballyDismissedFilter"
              >
                <Icon
                  :icon="
                    isGloballyDismissedFilterActive
                      ? theme.filters.globallyDismissed.iconOn
                      : theme.filters.globallyDismissed.iconOff
                  "
                />
              </va-button>
            </va-popover>
            <va-popover message="Mark all as read">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                data-testid="mark-all-read"
                aria-label="Mark all as read"
                :disabled="mutationPending"
                @click="onMarkAllRead"
                @keydown.enter.prevent="onMarkAllRead"
                @keydown.space.prevent="onMarkAllRead"
              >
                <Icon :icon="theme.actions.read.icon" />
              </va-button>
            </va-popover>
          </div>
          <div class="flex items-center justify-between mt-2">
            <div
              class="text-xs text-secondary"
              data-testid="notification-visible-count"
            >
              Showing {{ displayedNotifications.length }}
            </div>
            <va-popover v-if="hasActiveFilters" message="Clear filters">
              <va-button
                preset="secondary"
                size="small"
                data-testid="clear-notification-filters"
                aria-label="Clear filters"
                :disabled="mutationPending"
                @click="handleClearFilters"
                @keydown.enter.prevent="handleClearFilters"
                @keydown.space.prevent="handleClearFilters"
              >
                <Icon icon="mdi:filter-remove-outline" />
              </va-button>
            </va-popover>
          </div>
          <div
            v-if="hasActiveFilterChips"
            class="flex gap-2 mt-2 flex-wrap"
          >
            <div
              v-if="isReadFilterActive"
              class="notification-filter-chip notification-filter-chip--info"
              data-testid="active-filter-chip-read"
            >
              Read
              <button
                type="button"
                class="notification-filter-chip__clear"
                aria-label="Clear Read filter"
                data-testid="active-filter-chip-read-clear"
                tabindex="0"
                :disabled="mutationPending"
                @click.prevent.stop="clearReadFilter"
                @keydown.enter.prevent.stop="clearReadFilter"
                @keydown.space.prevent.stop="clearReadFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div
              v-if="isArchivedFilterActive"
              class="notification-filter-chip notification-filter-chip--warning"
              data-testid="active-filter-chip-archived"
            >
              Archived
              <button
                type="button"
                class="notification-filter-chip__clear"
                aria-label="Clear Archived filter"
                data-testid="active-filter-chip-archived-clear"
                tabindex="0"
                :disabled="mutationPending"
                @click.prevent.stop="clearArchivedFilter"
                @keydown.enter.prevent.stop="clearArchivedFilter"
                @keydown.space.prevent.stop="clearArchivedFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div
              v-if="isBookmarkedFilterActive"
              class="notification-filter-chip notification-filter-chip--success"
              data-testid="active-filter-chip-bookmarked"
            >
              Bookmarked
              <button
                type="button"
                class="notification-filter-chip__clear"
                aria-label="Clear Bookmarked filter"
                data-testid="active-filter-chip-bookmarked-clear"
                tabindex="0"
                :disabled="mutationPending"
                @click.prevent.stop="clearBookmarkedFilter"
                @keydown.enter.prevent.stop="clearBookmarkedFilter"
                @keydown.space.prevent.stop="clearBookmarkedFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div
              v-if="isGloballyDismissedFilterActive"
              class="notification-filter-chip notification-filter-chip--danger"
              data-testid="active-filter-chip-globally-dismissed"
            >
              Globally Dismissed
              <button
                type="button"
                class="notification-filter-chip__clear"
                aria-label="Clear Globally Dismissed filter"
                data-testid="active-filter-chip-globally-dismissed-clear"
                tabindex="0"
                :disabled="mutationPending"
                @click.prevent.stop="clearGloballyDismissedFilter"
                @keydown.enter.prevent.stop="clearGloballyDismissedFilter"
                @keydown.space.prevent.stop="clearGloballyDismissedFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div
              v-if="activeSearchFilter"
              class="notification-filter-chip notification-filter-chip--secondary"
              data-testid="active-filter-chip-search"
            >
              Search: {{ activeSearchFilter }}
              <button
                type="button"
                class="notification-filter-chip__clear"
                aria-label="Clear Search filter"
                data-testid="active-filter-chip-search-clear"
                tabindex="0"
                :disabled="mutationPending"
                @click.prevent.stop="clearSearchFilter"
                @keydown.enter.prevent.stop="clearSearchFilter"
                @keydown.space.prevent.stop="clearSearchFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
          </div>
          <div class="mt-2">
            <va-input
              v-model="searchInput"
              class="notification-search-input"
              placeholder="Search notifications"
              clearable
              :disabled="mutationPending"
              @keydown.stop="onSearchInputKeydown"
              @click.capture="onSearchInputClick"
              @clear="clearSearchFilter"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
              data-testid="notification-search"
            />
          </div>
      </div>

      <div
        class="notification-menu-list flex-1 min-h-0 overflow-y-auto relative"
        data-testid="notification-menu-scroll"
        @scroll.passive="onMenuScroll"
      >
        <va-inner-loading :loading="listFetching || mutationPending">
          <template v-if="displayedNotifications.length === 0">
            <div
              class="px-3 py-3 text-sm text-secondary"
              data-testid="notification-empty-state"
            >
              {{
                filters.globallyDismissed
                  ? "No globally dismissed notifications"
                  : "No pending notifications"
              }}
            </div>
          </template>
          <template v-else>
            <div
              v-for="notification in displayedNotifications"
              :key="notification.id"
              class="px-3 py-2"
            >
              <notification
                :notification="notification"
                :disabled="mutationPending"
                @toggle-read="onToggleRead"
                @toggle-archived="onToggleArchived"
                @toggle-bookmarked="onToggleBookmarked"
                @toggle-global-dismiss="onGlobalDismiss"
              ></notification>
              <va-divider class="mt-2" />
            </div>
          </template>
        </va-inner-loading>
      </div>
    </div>
  </va-menu>
</template>

<script setup>
import config from "@/config";
import constants from "@/constants";
import {
  getVisibleNotificationMenuPanel,
  removeVisibleSearchFilterChips,
} from "@/services/notifications/filterChipDom";
import { viewerHasPrivilegedNotificationAccess } from "@/services/notifications/viewerAccess";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const { notificationTheme: theme } = constants;

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
  searchEchoLock,
} = storeToRefs(notificationStore);
const {
  refreshNotifications,
  fetchNotifications,
  fetchMoreNotifications,
  updateNotificationState,
  markAllRead,
  dismissNotificationGlobally,
  setFilter,
  setSearchEchoLock,
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
const activeSearchFilter = computed(() => {
  if (searchEchoLock.value) return "";
  return (filters.value.search || "").trim();
});
const isSearchFocused = ref(false);
const hasPendingSseRefresh = ref(false);
const isSseConnected = ref(false);
const notificationStream = ref(null);
const firstTopControlRef = ref(null);
const notificationOpenButtonRef = ref(null);
const displayedNotifications = computed(() => notifications.value);
const isUnreadFilterActive = computed(() => filters.value.read === false);
const isReadFilterActive = computed(() => filters.value.read === true);
const isArchivedFilterActive = computed(() => filters.value.archived === true);
const isBookmarkedFilterActive = computed(
  () => filters.value.bookmarked === true,
);
const isGloballyDismissedFilterActive = computed(
  () => filters.value.globallyDismissed === true,
);

const hasActiveFilters = computed(() => {
  return (
    isReadFilterActive.value ||
    isArchivedFilterActive.value ||
    isBookmarkedFilterActive.value ||
    isGloballyDismissedFilterActive.value ||
    Boolean(activeSearchFilter.value)
  );
});
const badgeCount = computed(() => {
  if (hasActiveFilters.value) {
    return totalMatchedCount.value;
  }
  return unreadCount.value;
});
const hasActiveFilterChips = computed(() => {
  return (
    isReadFilterActive.value ||
    isArchivedFilterActive.value ||
    isBookmarkedFilterActive.value ||
    isGloballyDismissedFilterActive.value ||
    Boolean(activeSearchFilter.value)
  );
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
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    )
  ) {
    return el;
  }
  return el.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
  );
}

function focusFirstMenuControlSoon() {
  let attempts = 0;
  const maxAttempts = 400;
  const tryFocus = () => {
    attempts += 1;
    const panel = getVisibleNotificationMenuPanel();
    const anchor =
      panel?.querySelector('[data-testid="filter-unread"]')
      || (firstTopControlRef.value?.$el instanceof HTMLElement
        ? firstTopControlRef.value.$el
        : null);
    const node = focusableControl(anchor);
    if (node && node.offsetParent !== null) {
      node.focus();
      if (document.activeElement !== node && attempts < maxAttempts) {
        setTimeout(tryFocus, 30);
        return;
      }
      return;
    }
    if (attempts < maxAttempts) {
      setTimeout(tryFocus, 30);
    }
  };
  setTimeout(tryFocus, 0);
}

function onNotificationOpenActivate() {
  setSearchEchoLock(false);
  focusFirstMenuControlSoon();
}

function onSearchFocus() {
  setSearchEchoLock(false);
  isSearchFocused.value = true;
}

function onSearchInputKeydown() {
  setSearchEchoLock(false);
}

function onSearchBlur() {
  isSearchFocused.value = false;
  if (hasPendingSseRefresh.value) {
    hasPendingSseRefresh.value = false;
    refreshNotifications(notificationQueryOpts.value);
  }
}

function clearSearchFilter() {
  setSearchEchoLock(true);
  setFilter("search", "");
  nextTick(() => {
    removeVisibleSearchFilterChips();
  });
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

function toggleArchivedFilter() {
  setFilter("archived", !filters.value.archived);
  fetchNotifications(notificationQueryOpts.value);
}

function clearArchivedFilter() {
  setFilter("archived", false);
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

function toggleGloballyDismissedFilter() {
  setFilter("globallyDismissed", !filters.value.globallyDismissed);
  fetchNotifications(notificationQueryOpts.value);
}

function clearGloballyDismissedFilter() {
  setFilter("globallyDismissed", false);
  fetchNotifications(notificationQueryOpts.value);
}

function handleClearFilters() {
  setSearchEchoLock(true);
  clearFilters();
  nextTick(() => {
    removeVisibleSearchFilterChips();
  });
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

function onToggleArchived(notification) {
  updateNotificationState(
    notification.id,
    {
      is_archived: !notification.state.is_archived,
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

function onGlobalDismiss(notification) {
  dismissNotificationGlobally(notification.id, notificationQueryOpts.value);
}

function onMarkAllRead() {
  markAllRead(notificationQueryOpts.value);
}

function closeNotificationStream() {
  if (notificationStream.value) {
    notificationStream.value.close();
    notificationStream.value = null;
  }
  isSseConnected.value = false;
}

function onSseInvalidate() {
  if (isSearchFocused.value) {
    hasPendingSseRefresh.value = true;
    return;
  }
  refreshNotifications(notificationQueryOpts.value);
}

function openNotificationStream() {
  closeNotificationStream();
  const token = useLocalStorage("token", "");
  const authToken = token.value;
  if (!authToken) return;
  const username = authUser.value?.username;
  const streamPath =
    forSelf.value && username
      ? `/notifications/${encodeURIComponent(username)}/stream`
      : "/notifications/stream";
  const streamUrl = `${config.apiBasePath}${streamPath}?token=${encodeURIComponent(authToken)}`;
  const source = new EventSource(streamUrl);
  source.addEventListener("ready", () => {
    isSseConnected.value = true;
  });
  source.addEventListener("notification", onSseInvalidate);
  source.onerror = () => {
    isSseConnected.value = false;
  };
  notificationStream.value = source;
}

// retrieve notifications every 5 seconds
const { resume } = useIntervalFn(
  () => {
    if (isSearchFocused.value || isSseConnected.value) return;
    refreshNotifications(notificationQueryOpts.value);
  },
  config.notifications.pollingInterval,
  {
    immediateCallback: true,
  },
);

onMounted(() => {
  openNotificationStream();
  resume();
});

onUnmounted(() => {
  closeNotificationStream();
});
</script>

<style lang="scss" scoped>
.notification-open-button {
  color: var(--va-text-primary) !important;
}

.notification-top-controls {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
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

.notification-top-control-button :deep(.va-button__content) {
  justify-content: center;
}

/* Keep menu width deterministic per app breakpoint thresholds from ui/vuestic.config.js */
.notification-menu-panel {
  width: min(22rem, calc(100vw - 1rem));
  min-width: min(22rem, calc(100vw - 1rem));
  max-width: min(22rem, calc(100vw - 1rem));
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

.notification-filter-chip__clear:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  border-radius: 9999px;
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
