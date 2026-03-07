<template>
  <div
    class="notif-item"
    :class="[`type-${props.notification.type}`, { unread: !props.notification.is_read }]"
  >
    <!-- Icon -->
    <div class="notif-icon">
      <Icon :icon="TYPE_ICONS[props.notification.type] ?? TYPE_ICONS.fallback" class="text-lg" />
    </div>

    <!-- Body -->
    <div class="notif-body min-w-0 flex-1">
      <p class="notif-title truncate">{{ props.notification.title }}</p>
      <p v-if="props.notification.body && !props.compact" class="notif-summary">
        {{ props.notification.body }}
      </p>

      <!-- Type-specific payload rendering -->
      <component
        :is="TYPE_COMPONENTS[props.notification.type] ?? FallbackNotification"
        :notification="props.notification"
        class="mt-1"
      />

      <!-- Meta row -->
      <div class="notif-meta mt-1.5">
        <span class="notif-type-tag">{{ props.notification.type }}</span>
        <span class="notif-dot" />
        <span class="notif-time">{{ fromNow(props.notification.created_at) }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="notif-actions">
      <va-button
        v-if="!props.notification.is_read"
        plain
        round
        size="small"
        title="Mark as read"
        @click.stop="store.markRead(props.notification.id)"
      >
        <i-mdi-email-open-outline class="text-base" />
      </va-button>
      <va-button
        v-if="auth.canOperate"
        plain
        round
        size="small"
        color="danger"
        title="Delete"
        @click.stop="store.deleteNotification(props.notification.id)"
      >
        <i-mdi-delete-outline class="text-base" />
      </va-button>
    </div>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification";
import { Icon } from "@iconify/vue";
import AlertNotification from "./types/AlertNotification.vue";
import FallbackNotification from "./types/FallbackNotification.vue";
import RequestNotification from "./types/RequestNotification.vue";
import SystemNotification from "./types/SystemNotification.vue";
import WorkflowNotification from "./types/WorkflowNotification.vue";

const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const store = useNotificationStore();
const auth = useAuthStore();

const TYPE_COMPONENTS = {
  alert: AlertNotification,
  workflow: WorkflowNotification,
  request: RequestNotification,
  system: SystemNotification,
};

// Iconify icon names — resolved dynamically by <Icon> at render time
const TYPE_ICONS = {
  alert: "mdi:alert-circle-outline",
  workflow: "mdi:sync",
  request: "mdi:account-question-outline",
  system: "mdi:information-outline",
  fallback: "mdi:bell-outline",
};

function fromNow(value) {
  return datetime.fromNow(value);
}
</script>

<style scoped>
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--va-background-border);
  background: var(--va-background-element);
  transition: background 0.15s, border-color 0.15s;
}

.notif-item:hover {
  background: var(--va-background-secondary);
}

/* Unread left accent */
.notif-item.unread {
  border-left-width: 3px;
}

.type-alert.unread    { border-left-color: var(--va-danger); }
.type-workflow.unread { border-left-color: var(--va-primary); }
.type-request.unread  { border-left-color: var(--va-warning); }
.type-system.unread   { border-left-color: var(--va-info); }

/* Icon cell */
.notif-icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
}

.type-alert    .notif-icon { background: rgba(228, 34, 34, 0.1);  color: var(--va-danger); }
.type-workflow .notif-icon { background: rgba(21, 78, 193, 0.1);  color: var(--va-primary); }
.type-request  .notif-icon { background: rgba(255, 212, 58, 0.12); color: #b38600; }
.type-system   .notif-icon { background: rgba(21, 141, 227, 0.1); color: var(--va-info); }

.dark .type-request .notif-icon { color: var(--va-warning); }

/* Title */
.notif-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
}

/* Summary */
.notif-summary {
  font-size: 0.8rem;
  color: var(--va-secondary);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Meta */
.notif-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.notif-type-tag {
  font-size: 0.65rem;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 999px;
  text-transform: capitalize;
}

.type-alert    .notif-type-tag { background: rgba(228, 34, 34, 0.1);  color: var(--va-danger); }
.type-workflow .notif-type-tag { background: rgba(21, 78, 193, 0.1);  color: var(--va-primary); }
.type-request  .notif-type-tag { background: rgba(255, 212, 58, 0.12); color: #b38600; }
.type-system   .notif-type-tag { background: rgba(21, 141, 227, 0.1); color: var(--va-info); }

.dark .type-request .notif-type-tag { color: var(--va-warning); }

.notif-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--va-secondary);
  flex-shrink: 0;
}

.notif-time {
  font-size: 0.7rem;
  color: var(--va-secondary);
}

/* Actions column */
.notif-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.notif-item:hover .notif-actions {
  opacity: 1;
}
</style>
