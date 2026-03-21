<template>
  <div class="notification-anchor">
    <div
      v-if="showChipsRow"
      class="flex gap-2 mb-2 flex-wrap"
    >
      <template v-if="isRoleBroadcast && roleOutlineNames.length > 0">
        <va-chip
          size="small"
          :color="theme.delivery.roleBroadcast.color"
        >
          Role Broadcast
        </va-chip>
        <va-chip
          v-for="name in roleOutlineNames"
          :key="name"
          size="small"
          outline
          :color="theme.delivery.roleBroadcast.color"
        >
          {{ name }}
        </va-chip>
      </template>
      <va-chip
        size="small"
        :color="theme.filters.globallyDismissed.color"
        v-if="notification.global_dismissal?.is_globally_dismissed"
      >
        Globally Dismissed
      </va-chip>
    </div>
    <h6
      class="va-h6 mb-1"
      :data-testid="`notification-${notification.id}-label`"
    >
      {{ props.notification.label }}
    </h6>
    <p class="mb-2" :data-testid="`notification-${notification.id}-text`">
      {{ props.notification.text }}
    </p>

    <div
      class="grid grid-cols-1 gap-2 mb-2"
      v-if="notification.allowed_links?.length > 0"
    >
      <va-button
        v-for="link in notification.allowed_links"
        :key="link.id"
        size="small"
        block
        :disabled="disabled"
        color="primary"
        preset="primary"
        tabindex="0"
        :data-testid="`notification-${notification.id}-link-${link.id}`"
        @click.prevent="handleLinkClick(link)"
        @keydown.enter.prevent="handleLinkClick(link)"
        @keydown.space.prevent="handleLinkClick(link)"
      >
        <Icon :icon="theme.actions.link.icon" class="mr-1" />
        {{ link.label }}
      </va-button>
    </div>

    <div
      class="notification-state-actions"
      :style="{
        gridTemplateColumns: `repeat(${actionButtonsCount}, minmax(0, 1fr))`,
      }"
    >
      <va-button
        size="small"
        preset="secondary"
        block
        class="notification-state-action-button"
        :color="theme.actions.read.color"
        :data-testid="`notification-${notification.id}-toggle-read`"
        tabindex="0"
        :disabled="disabled"
        @click="$emit('toggle-read', notification)"
        @keydown.enter.prevent="$emit('toggle-read', notification)"
        @keydown.space.prevent="$emit('toggle-read', notification)"
      >
        <Icon
          :icon="
            notification.state.is_read
              ? 'mdi:email-outline'
              : theme.actions.read.icon
          "
          class="mr-1"
        />
        {{ notification.state.is_read ? "Mark unread" : "Mark read" }}
      </va-button>
      <va-button
        size="small"
        preset="secondary"
        block
        class="notification-state-action-button"
        :color="theme.actions.bookmark.color"
        :data-testid="`notification-${notification.id}-toggle-bookmark`"
        tabindex="0"
        :disabled="disabled"
        @click="$emit('toggle-bookmarked', notification)"
        @keydown.enter.prevent="$emit('toggle-bookmarked', notification)"
        @keydown.space.prevent="$emit('toggle-bookmarked', notification)"
      >
        <Icon
          :icon="
            notification.state.is_bookmarked
              ? 'mdi:bookmark-minus-outline'
              : theme.actions.bookmark.icon
          "
          class="mr-1"
        />
        {{ notification.state.is_bookmarked ? "Unbookmark" : "Bookmark" }}
      </va-button>
      <va-button
        size="small"
        preset="secondary"
        block
        class="notification-state-action-button"
        :color="theme.actions.archive.color"
        :data-testid="`notification-${notification.id}-toggle-archive`"
        tabindex="0"
        :disabled="disabled"
        @click="$emit('toggle-archived', notification)"
        @keydown.enter.prevent="$emit('toggle-archived', notification)"
        @keydown.space.prevent="$emit('toggle-archived', notification)"
      >
        <Icon
          :icon="
            notification.state.is_archived
              ? 'mdi:archive-arrow-up-outline'
              : theme.actions.archive.icon
          "
          class="mr-1"
        />
        {{ notification.state.is_archived ? "Unarchive" : "Archive" }}
      </va-button>
      <va-button
        size="small"
        preset="secondary"
        block
        class="notification-state-action-button"
        :color="theme.actions.globalDismiss.color"
        :data-testid="`notification-${notification.id}-global-dismiss`"
        tabindex="0"
        v-if="
          notification.can_global_dismiss &&
          !notification.global_dismissal?.is_globally_dismissed
        "
        :disabled="disabled"
        @click="$emit('toggle-global-dismiss', notification)"
        @keydown.enter.prevent="$emit('toggle-global-dismiss', notification)"
        @keydown.space.prevent="$emit('toggle-global-dismiss', notification)"
      >
        <Icon :icon="theme.actions.globalDismiss.icon" class="mr-1" />
        Dismiss globally
      </va-button>
    </div>
    <p
      class="mt-2 text-sm"
      v-if="
        notification.global_dismissal?.is_globally_dismissed &&
        notification.global_dismissal?.dismissed_by
      "
    >
      Dismissed by {{ notification.global_dismissal.dismissed_by.username }}
    </p>
  </div>

  <va-modal
    v-model="showUntrustedLinkModal"
    title="Untrusted Link"
    size="small"
    ok-text="Continue"
    cancel-text="Cancel"
    @ok="confirmUntrustedNavigation"
    @cancel="selectedUntrustedLink = null"
  >
    You are about to open an untrusted link in a new tab. Proceed only if you
    trust the destination.
  </va-modal>
</template>

<script setup>
import constants from "@/constants";
import { viewerHasPrivilegedNotificationAccess } from "@/services/notifications/viewerAccess";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

const { notificationTheme: theme } = constants;
const { canOperate } = storeToRefs(useAuthStore());

const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});
defineEmits([
  "toggle-read",
  "toggle-archived",
  "toggle-bookmarked",
  "toggle-global-dismiss",
]);
const showUntrustedLinkModal = ref(false);
const selectedUntrustedLink = ref(null);

const isRoleBroadcast = computed(
  () => props.notification.delivery.type === "ROLE_BROADCAST",
);

const canSeeBroadcastTargets = computed(() =>
  viewerHasPrivilegedNotificationAccess(canOperate.value),
);

const roleOutlineNames = computed(() => {
  if (!isRoleBroadcast.value || !canSeeBroadcastTargets.value) {
    return [];
  }
  const { broadcast_role_names: multi, role_name: single } = props.notification.delivery;
  if (Array.isArray(multi) && multi.length > 0) {
    return multi;
  }
  if (single) {
    return [single];
  }
  return [];
});

const showChipsRow = computed(
  () =>
    (isRoleBroadcast.value && roleOutlineNames.value.length > 0)
    || Boolean(props.notification.global_dismissal?.is_globally_dismissed),
);

const actionButtonsCount = computed(() =>
  props.notification.can_global_dismiss &&
  !props.notification.global_dismissal?.is_globally_dismissed
    ? 4
    : 3,
);

function openLink(link) {
  if (link.open_in_new_tab) {
    window.open(link.href, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(link.href);
}

function handleLinkClick(link) {
  if (props.disabled) return;
  if (link.trusted) {
    openLink(link);
    return;
  }
  selectedUntrustedLink.value = link;
  showUntrustedLinkModal.value = true;
}

function confirmUntrustedNavigation() {
  if (!selectedUntrustedLink.value) return;
  openLink({
    ...selectedUntrustedLink.value,
    open_in_new_tab: true,
  });
  selectedUntrustedLink.value = null;
}
</script>

<style lang="scss" scoped>
.notification-anchor {
  color: var(--va-text-primary);
}

.notification-state-actions {
  display: grid;
  gap: 0.5rem;
  width: 100%;
}

.notification-state-action-button {
  width: 100%;
}
</style>
