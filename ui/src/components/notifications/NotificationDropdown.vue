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

      <div class="max-w-md max-h-96 overflow-y-auto" data-testid="notification-menu-items">
        <div class="px-3 py-2 border-b">
          <div class="flex gap-2 flex-wrap">
            <va-button
              preset="secondary"
              size="small"
              :color="filters.read === false ? 'primary' : 'secondary'"
              data-testid="filter-unread"
              @click="toggleReadFilter(false)"
            >
              Unread
            </va-button>
            <va-button
              preset="secondary"
              size="small"
              :color="filters.read === true ? 'primary' : 'secondary'"
              data-testid="filter-read"
              @click="toggleReadFilter(true)"
            >
              Read
            </va-button>
            <va-button
              preset="secondary"
              size="small"
              :color="filters.archived ? 'primary' : 'secondary'"
              data-testid="filter-archived"
              @click="toggleArchivedFilter"
            >
              Archived
            </va-button>
            <va-button
              preset="secondary"
              size="small"
              :color="filters.bookmarked ? 'primary' : 'secondary'"
              data-testid="filter-bookmarked"
              @click="toggleBookmarkedFilter"
            >
              Bookmark
            </va-button>
            <va-button
              v-if="hasActiveFilters"
              preset="secondary"
              size="small"
              data-testid="clear-notification-filters"
              @click="handleClearFilters"
            >
              Clear
            </va-button>
          </div>
          <div class="mt-2">
            <va-input
              v-model="searchInput"
              placeholder="Search notifications"
              clearable
              @update:model-value="handleSearch"
              data-testid="notification-search"
            />
          </div>
          <div class="flex gap-2 mt-2 flex-wrap" v-if="hasActiveFilters">
            <va-chip closeable outline v-if="filters.read === true" @update:model-value="toggleReadFilter(true)">
              Read
            </va-chip>
            <va-chip closeable outline v-if="filters.read === false" @update:model-value="toggleReadFilter(false)">
              Unread
            </va-chip>
            <va-chip closeable outline v-if="filters.archived" @update:model-value="toggleArchivedFilter">
              Archived
            </va-chip>
            <va-chip closeable outline v-if="filters.bookmarked" @update:model-value="toggleBookmarkedFilter">
              Bookmarked
            </va-chip>
            <va-chip closeable outline v-if="filters.search" @update:model-value="clearSearchFilter">
              Search: {{ filters.search }}
            </va-chip>
          </div>
        </div>

        <va-menu-item v-if="notifications.length === 0">
          No pending notifications
        </va-menu-item>

        <va-menu-item
          v-else
          v-for="(notification, index) in notifications"
          :key="index"
        >
          <notification
            :notification="notification"
            @toggle-read="onToggleRead"
            @toggle-archived="onToggleArchived"
            @toggle-bookmarked="onToggleBookmarked"
          ></notification>
          <va-divider />
        </va-menu-item>
      </div>
    </va-menu>
  </va-inner-loading>
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";
import config from "@/config";

const notificationStore = useNotificationStore();

const { notifications, filters } = storeToRefs(notificationStore);
const {
  fetchNotifications,
  updateNotificationState,
  setFilter,
  clearFilters,
} = notificationStore;
const searchInput = ref("");

const hasActiveFilters = computed(() => {
  return (
    filters.value.read !== null ||
    filters.value.archived === true ||
    filters.value.bookmarked === true ||
    Boolean(filters.value.search)
  );
});

function handleSearch(val) {
  setFilter("search", val || "");
  fetchNotifications();
}

function clearSearchFilter() {
  searchInput.value = "";
  setFilter("search", "");
  fetchNotifications();
}

function toggleReadFilter(expectedState) {
  const nextValue = filters.value.read === expectedState ? null : expectedState;
  setFilter("read", nextValue);
  fetchNotifications();
}

function toggleArchivedFilter() {
  setFilter("archived", !filters.value.archived);
  fetchNotifications();
}

function toggleBookmarkedFilter() {
  setFilter("bookmarked", !filters.value.bookmarked);
  fetchNotifications();
}

function handleClearFilters() {
  clearFilters();
  searchInput.value = "";
  fetchNotifications();
}

function onToggleRead(notification) {
  updateNotificationState(notification.id, {
    is_read: !notification.state.is_read,
  });
}

function onToggleArchived(notification) {
  updateNotificationState(notification.id, {
    is_archived: !notification.state.is_archived,
  });
}

function onToggleBookmarked(notification) {
  updateNotificationState(notification.id, {
    is_bookmarked: !notification.state.is_bookmarked,
  });
}

// retrieve notifications every 5 seconds
const { resume } = useIntervalFn(
  fetchNotifications,
  config.notifications.pollingInterval,
  {
    immediateCallback: true,
  },
);

onMounted(() => {
  searchInput.value = filters.value.search || "";
  resume();
});
</script>

<style lang="scss" scoped>
.notification-bell {
  color: var(--va-text-primary) !important;
}
</style>
