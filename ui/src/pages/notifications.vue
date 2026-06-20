<template>
  <div class="notifications-page">
    <!-- Page header -->
    <div class="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-semibold">Notifications</h2>
        <span v-if="store.totalCount > 0" class="total-count-badge"
          >{{ store.totalCount }} total</span
        >
        <va-badge
          v-if="store.unreadCount > 0"
          :text="store.unreadCount"
          color="danger"
        />
      </div>
      <va-button
        preset="secondary"
        size="small"
        :disabled="store.unreadCount === 0"
        @click="store.markAllRead()"
      >
        <template #prepend>
          <i-mdi-email-open-outline class="mr-1" />
        </template>
        Mark all as read
      </va-button>
    </div>

    <!-- Filter chips -->
    <div class="filter-bar mb-4">
      <button
        v-for="f in FILTERS"
        :key="f.value"
        class="filter-chip"
        :class="{ active: activeFilter === f.value }"
        @click="setFilter(f.value)"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="flex justify-center py-10">
      <va-progress-circle indeterminate />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="filteredNotifications.length === 0"
      class="flex flex-col items-center justify-center py-16 gap-3"
      style="color: var(--va-secondary)"
    >
      <i-mdi-bell-off-outline class="text-5xl" />
      <p class="text-base">
        {{
          activeFilter === "all"
            ? "No notifications yet"
            : `No ${activeFilter} notifications`
        }}
      </p>
    </div>

    <!-- Notification list -->
    <div v-else class="notif-list mb-6">
      <NotificationItem
        v-for="notification in filteredNotifications"
        :key="notification.id"
        :notification="notification"
      />
    </div>

    <!-- Pagination -->
    <Pagination
      :curr_items="filteredNotifications.length"
      :total_results="store.totalCount"
      :page="store.page"
      :page_size="store.limit"
      :page_size_options="PAGE_SIZE_OPTIONS"
      @update:page="onPageChange"
      @update:page_size="onPageSizeChange"
    />
  </div>
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";

const store = useNotificationStore();

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Alert", value: "alert" },
  { label: "Workflow", value: "workflow" },
  { label: "Request", value: "request" },
  { label: "System", value: "system" },
];

const activeFilter = ref("all");

const filteredNotifications = computed(() => {
  if (activeFilter.value === "all") return store.notifications;
  if (activeFilter.value === "unread")
    return store.notifications.filter((n) => !n.is_read);
  return store.notifications.filter((n) => n.type === activeFilter.value);
});

function setFilter(value) {
  activeFilter.value = value;
}

async function onPageChange(newPage) {
  await store.fetchPage(newPage, store.limit);
}

async function onPageSizeChange(newLimit) {
  await store.fetchPage(1, newLimit);
}

onMounted(async () => {
  await Promise.all([store.fetchPage(1, 20), store.fetchUnreadCount()]);
});
</script>

<style scoped>
.total-count-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--va-background-border);
  color: var(--va-secondary);
}

.notifications-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 16px;
}

/* Filter bar */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--va-background-border);
  background: transparent;
  color: var(--va-secondary);
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.filter-chip:hover {
  border-color: var(--va-primary);
  color: var(--va-text-primary);
}

.filter-chip.active {
  border-color: var(--va-primary);
  color: var(--va-primary);
  background: rgba(21, 78, 193, 0.08);
}

/* Notification list */
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>

<route lang="yaml">
meta:
  requiresAuth: true
  title: "Notifications"
</route>
