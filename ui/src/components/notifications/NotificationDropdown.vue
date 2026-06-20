<template>
  <va-menu placement="left-bottom">
    <template #anchor>
      <va-badge
        :text="store.unreadCount > 0 ? store.unreadCount : ''"
        overlap
        data-testid="notification-count"
      >
        <va-button
          data-testid="notification-icon"
          class="notification-bell"
          plain
          :class="{ 'badge-pop': badgeAnimating }"
        >
          <Icon icon="mdi-bell-outline" height="24px" width="24px" />
        </va-button>
      </va-badge>
    </template>

    <div class="notif-dropdown" data-testid="notification-menu-items">
      <!-- Header -->
      <div class="notif-dropdown-header">
        <span class="font-semibold text-sm">Notifications</span>
        <va-button
          size="small"
          preset="plain"
          :disabled="store.unreadCount === 0"
          @click="store.markAllRead()"
        >
          Mark all read
        </va-button>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="notif-dropdown-empty">
        <va-progress-circle indeterminate size="small" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="recentNotifications.length === 0"
        class="notif-dropdown-empty"
      >
        <i-mdi-bell-off-outline
          class="text-3xl mb-1"
          style="color: var(--va-secondary)"
        />
        <span class="text-sm" style="color: var(--va-secondary)"
          >No notifications yet</span
        >
      </div>

      <!-- Notification list -->
      <div v-else class="notif-dropdown-list">
        <NotificationItem
          v-for="notification in recentNotifications"
          :key="notification.id"
          :notification="notification"
          compact
        />
      </div>

      <!-- Footer -->
      <div class="notif-dropdown-footer">
        <router-link to="/notifications" class="notif-view-all">
          View all notifications
          <i-mdi-arrow-right class="inline text-xs ml-0.5" />
        </router-link>
      </div>
    </div>
  </va-menu>
</template>

<script setup>
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const store = useNotificationStore();
const { notifications } = storeToRefs(store);

// Show at most 8 most recent notifications in the dropdown
const recentNotifications = computed(() => notifications.value.slice(0, 8));

// Badge pop animation on new notification
const badgeAnimating = ref(false);
let animTimeout = null;

watch(
  () => store.unreadCount,
  (next, prev) => {
    if (next > prev) {
      badgeAnimating.value = true;
      clearTimeout(animTimeout);
      animTimeout = setTimeout(() => {
        badgeAnimating.value = false;
      }, 400);
    }
  },
);

onMounted(async () => {
  await store.fetchUnreadCount();
  // Fetch recent notifications for the dropdown; full pagination is on the page.
  await store.fetchPage(1, 8);
});

onUnmounted(() => {
  clearTimeout(animTimeout);
});
</script>

<style scoped>
.notification-bell {
  color: var(--va-text-primary) !important;
}

.badge-pop {
  animation: badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes badge-pop {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.25);
  }
}

/* Dropdown panel */
.notif-dropdown {
  width: 360px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notif-dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--va-background-border);
  flex-shrink: 0;
}

.notif-dropdown-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  gap: 4px;
}

.notif-dropdown-list {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.notif-dropdown-footer {
  flex-shrink: 0;
  padding: 8px 14px;
  border-top: 1px solid var(--va-background-border);
  text-align: center;
}

.notif-view-all {
  font-size: 0.8rem;
  color: var(--va-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.notif-view-all:hover {
  text-decoration: underline;
}
</style>
