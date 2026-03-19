<template>
  <va-inner-loading :loading="loading">
    <va-menu placement="left-bottom" :close-on-content-click="false">
      <template #anchor>
        <va-badge
          :offset="[-3, 10]"
          :text="`${badgeCount > 0 ? badgeCount : ''}`"
          overlap
          data-testid="notification-count"
        >
          <va-button
            ref="notificationBellRef"
            data-testid="notification-icon"
            class="notification-bell"
            plain
            @click="onBellActivate"
            @keydown.enter.prevent="onBellKeyboardToggle"
            @keydown.space.prevent="onBellKeyboardToggle"
          >
            <Icon icon="mdi-bell-outline" height="36px" width="36px" />
          </va-button>
        </va-badge>
      </template>

      <div
        :key="menuRenderKey"
        class="notification-menu-panel max-h-96 overflow-y-auto"
        data-testid="notification-menu-items"
      >
        <div class="px-3 py-2 border-b">
          <div class="notification-top-controls" @keydown.capture="onTopControlsKeydown">
            <va-popover message="Unread filter">
              <va-button
                ref="firstTopControlRef"
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="isUnreadFilterActive ? theme.filters.unread.color : 'secondary'"
                data-testid="filter-unread"
                aria-label="Unread filter"
                :disabled="loading"
                @click="toggleUnreadFilter"
              >
                <Icon
                  :icon="isUnreadFilterActive ? theme.filters.unread.iconOn : theme.filters.unread.iconOff"
                />
              </va-button>
            </va-popover>
            <va-popover message="Read filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="isReadFilterActive ? theme.filters.read.color : 'secondary'"
                data-testid="filter-read"
                aria-label="Read filter"
                :disabled="loading"
                @click="toggleReadFilter"
              >
                <Icon
                  :icon="isReadFilterActive ? theme.filters.read.iconOn : theme.filters.read.iconOff"
                />
              </va-button>
            </va-popover>
            <va-popover message="Archived filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="isArchivedFilterActive ? theme.filters.archived.color : 'secondary'"
                data-testid="filter-archived"
                aria-label="Archived filter"
                :disabled="loading"
                @click="toggleArchivedFilter"
              >
                <Icon
                  :icon="isArchivedFilterActive ? theme.filters.archived.iconOn : theme.filters.archived.iconOff"
                />
              </va-button>
            </va-popover>
            <va-popover message="Bookmark filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="isBookmarkedFilterActive ? theme.filters.bookmarked.color : 'secondary'"
                data-testid="filter-bookmarked"
                aria-label="Bookmark filter"
                :disabled="loading"
                @click="toggleBookmarkedFilter"
              >
                <Icon
                  :icon="isBookmarkedFilterActive ? theme.filters.bookmarked.iconOn : theme.filters.bookmarked.iconOff"
                />
              </va-button>
            </va-popover>
            <va-popover message="Globally dismissed filter">
              <va-button
                preset="secondary"
                size="small"
                block
                class="notification-top-control-button"
                :color="isGloballyDismissedFilterActive ? theme.filters.globallyDismissed.color : 'secondary'"
                data-testid="filter-globally-dismissed"
                aria-label="Globally dismissed filter"
                :disabled="loading"
                @click="toggleGloballyDismissedFilter"
              >
                <Icon
                  :icon="isGloballyDismissedFilterActive
                    ? theme.filters.globallyDismissed.iconOn
                    : theme.filters.globallyDismissed.iconOff"
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
                :disabled="loading"
                @click="onMarkAllRead"
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
                :disabled="loading"
                @click="handleClearFilters"
              >
                <Icon icon="mdi:filter-remove-outline" />
              </va-button>
            </va-popover>
          </div>
          <div
            class="mt-2"
            @click.capture="onSearchInputClick"
            @keydown.capture="onSearchContainerKeydown"
          >
            <va-input
              v-model="searchInput"
              class="notification-search-input"
              placeholder="Search notifications"
              clearable
              :disabled="loading"
              @keydown.stop
              @clear="clearSearchFilter"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
              data-testid="notification-search"
            />
          </div>
          <div
            v-if="hasActiveFilterChips"
            :key="filterChipsRenderKey"
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
                :disabled="loading"
                @click.prevent.stop="clearReadFilter"
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
                :disabled="loading"
                @click.prevent.stop="clearArchivedFilter"
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
                :disabled="loading"
                @click.prevent.stop="clearBookmarkedFilter"
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
                :disabled="loading"
                @click.prevent.stop="clearGloballyDismissedFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div
              v-if="searchInput.trim()"
              class="notification-filter-chip notification-filter-chip--secondary"
              data-testid="active-filter-chip-search"
            >
              Search: {{ searchInput }}
              <button
                type="button"
                class="notification-filter-chip__clear"
                aria-label="Clear Search filter"
                data-testid="active-filter-chip-search-clear"
                :disabled="loading"
                @click.prevent.stop="clearSearchFilter"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
          </div>
        </div>

        <va-menu-item v-if="displayedNotifications.length === 0">
          {{
            filters.globallyDismissed
              ? "No globally dismissed notifications"
              : "No pending notifications"
          }}
        </va-menu-item>

        <va-menu-item
          v-else
          v-for="notification in displayedNotifications"
          :key="notification.id"
        >
          <notification
            :notification="notification"
            :disabled="loading"
            @toggle-read="onToggleRead"
            @toggle-archived="onToggleArchived"
            @toggle-bookmarked="onToggleBookmarked"
            @toggle-global-dismiss="onGlobalDismiss"
          ></notification>
          <va-divider />
        </va-menu-item>
      </div>
    </va-menu>
  </va-inner-loading>
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import config from "@/config";
import constants from "@/constants";

const { notificationTheme: theme } = constants;

const notificationStore = useNotificationStore();
const auth = useAuthStore();
const forSelf = computed(() => !(auth.canOperate || auth.canAdmin));
const notificationQueryOpts = computed(() => ({
  forSelf: forSelf.value,
  username: auth.user?.username || null,
}));

const { notifications, filters, unreadCount, loading } = storeToRefs(notificationStore);
const {
  refreshNotifications,
  fetchNotifications,
  updateNotificationState,
  markAllRead,
  dismissNotificationGlobally,
  setFilter,
  clearFilters,
} = notificationStore;
const searchInput = computed({
  get: () => filters.value.search || "",
  set: (val) => {
    setFilter("search", val || "");
  },
});
const isSearchFocused = ref(false);
const hasPendingSseRefresh = ref(false);
const isSseConnected = ref(false);
const notificationStream = ref(null);
const firstTopControlRef = ref(null);
const notificationBellRef = ref(null);
const TOP_CONTROL_IDS = [
  "filter-unread",
  "filter-read",
  "filter-archived",
  "filter-bookmarked",
  "filter-globally-dismissed",
  "mark-all-read",
];
const normalizedSearch = computed(() =>
  (searchInput.value || "").trim().toLowerCase(),
);
const displayedNotifications = computed(() => {
  if (!normalizedSearch.value) return notifications.value;
  return notifications.value.filter((notification) => {
    const label = (notification.label || "").toLowerCase();
    const text = (notification.text || "").toLowerCase();
    return (
      label.includes(normalizedSearch.value) ||
      text.includes(normalizedSearch.value)
    );
  });
});
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
    Boolean(searchInput.value.trim())
  );
});
const badgeCount = computed(() => {
  if (hasActiveFilters.value) {
    return displayedNotifications.value.length;
  }
  return unreadCount.value;
});
const hasActiveFilterChips = computed(() => {
  return (
    isReadFilterActive.value ||
    isArchivedFilterActive.value ||
    isBookmarkedFilterActive.value ||
    isGloballyDismissedFilterActive.value ||
    Boolean(searchInput.value.trim())
  );
});
const menuRenderKey = computed(() => {
  return [
    filters.value.read,
    filters.value.archived,
    filters.value.bookmarked,
    filters.value.globallyDismissed,
    normalizedSearch.value,
  ].join("|");
});
const filterChipsRenderKey = computed(() => {
  const readKey = filters.value.read === true ? "read" : "not-read";
  const archivedKey = filters.value.archived ? "archived" : "not-archived";
  const bookmarkedKey =
    filters.value.bookmarked === true ? "bookmarked" : "not-bookmarked";
  const globallyDismissedKey = filters.value.globallyDismissed
    ? "globally-dismissed"
    : "not-globally-dismissed";
  const searchKey = normalizedSearch.value || "no-search";
  return [
    readKey,
    archivedKey,
    bookmarkedKey,
    globallyDismissedKey,
    searchKey,
  ].join("|");
});

function onSearchInputClick(event) {
  const target = event?.target;
  if (!target || typeof target.closest !== "function") return;
  if (target.closest('[aria-label="reset"]')) {
    clearSearchFilter();
  }
}

function getVisibleMenuPanelElement() {
  const panels = Array.from(
    document.querySelectorAll('[data-testid="notification-menu-items"]'),
  );
  return panels.find(
    (panel) => panel instanceof HTMLElement && panel.offsetParent !== null,
  );
}

function focusMenuControlByTestId(testId) {
  const panel = getVisibleMenuPanelElement();
  if (!panel) return;
  const node = panel.querySelector(`[data-testid="${testId}"]`);
  if (node instanceof HTMLElement) {
    node.focus();
  }
}

function focusSearchInputField() {
  const panel = getVisibleMenuPanelElement();
  if (!panel) return;
  const input = panel.querySelector('input[data-testid="notification-search"]');
  if (input instanceof HTMLElement) {
    input.focus();
  }
}

function focusFirstNotificationAction() {
  const panel = getVisibleMenuPanelElement();
  if (!panel) return;
  const action = panel.querySelector('[data-testid$="-toggle-read"]');
  if (action instanceof HTMLElement) {
    action.focus();
  }
}

function getFocusableNode(target) {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  const root = target.$el instanceof HTMLElement ? target.$el : null;
  if (!root) return null;
  if (root.matches("button, [href], input, select, textarea, [tabindex]")) {
    return root;
  }
  return root.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
}

function focusFirstMenuControlSoon() {
  let attempts = 0;
  const tryFocus = () => {
    attempts += 1;
    const panel = getVisibleMenuPanelElement();
    const node =
      panel?.querySelector('[data-testid="filter-unread"]') ||
      getFocusableNode(firstTopControlRef.value);
    if (node && node.offsetParent !== null) {
      node.focus();
      return;
    }
    if (attempts < 10) {
      setTimeout(tryFocus, 50);
    }
  };
  setTimeout(tryFocus, 0);
}

function onBellKeyboardToggle() {
  const bellNode = getFocusableNode(notificationBellRef.value);
  if (!bellNode) return;
  bellNode.click();
  focusFirstMenuControlSoon();
}

function onBellActivate() {
  focusFirstMenuControlSoon();
}

function onTopControlsKeydown(event) {
  if (event.key !== "Tab") return;
  const activeTestId = document.activeElement?.getAttribute("data-testid");
  const index = TOP_CONTROL_IDS.indexOf(activeTestId);
  if (index === -1) return;
  event.preventDefault();
  if (event.shiftKey) {
    if (index === 0) {
      focusFirstNotificationAction();
      return;
    }
    focusMenuControlByTestId(TOP_CONTROL_IDS[index - 1]);
    return;
  }
  if (index === TOP_CONTROL_IDS.length - 1) {
    focusSearchInputField();
    return;
  }
  focusMenuControlByTestId(TOP_CONTROL_IDS[index + 1]);
}

function onSearchContainerKeydown(event) {
  if (event.key !== "Tab") return;
  const activeTestId = document.activeElement?.getAttribute("data-testid");
  if (activeTestId !== "notification-search") return;
  event.preventDefault();
  if (event.shiftKey) {
    focusMenuControlByTestId("filter-globally-dismissed");
    return;
  }
  focusFirstNotificationAction();
}

function onSearchFocus() {
  isSearchFocused.value = true;
}

function onSearchBlur() {
  isSearchFocused.value = false;
  if (hasPendingSseRefresh.value) {
    hasPendingSseRefresh.value = false;
    refreshNotifications(notificationQueryOpts.value);
  }
}

function clearSearchFilter() {
  setFilter("search", "");
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
  const streamUrl = `${config.apiBasePath}/notifications/stream?token=${encodeURIComponent(authToken)}`;
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
.notification-bell {
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
