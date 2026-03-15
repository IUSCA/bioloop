<template>
  <div class="notification-anchor">
    <h6 class="va-h6 mb-1" :data-testid="`notification-${notification.id}-label`">
      {{ props.notification.label }}
    </h6>
    <p class="mb-2" :data-testid="`notification-${notification.id}-text`">
      {{ props.notification.text }}
    </p>

    <div class="flex flex-wrap gap-2 mb-2" v-if="notification.allowed_links?.length > 0">
      <va-button
        v-for="link in notification.allowed_links"
        :key="link.id"
        size="small"
        preset="secondary"
        @click.prevent="handleLinkClick(link)"
      >
        {{ link.label }}
      </va-button>
    </div>

    <div class="flex gap-1">
      <va-button
        size="small"
        preset="secondary"
        :data-testid="`notification-${notification.id}-toggle-read`"
        @click="$emit('toggle-read', notification)"
      >
        {{ notification.state.is_read ? "Mark unread" : "Mark read" }}
      </va-button>
      <va-button
        size="small"
        preset="secondary"
        :data-testid="`notification-${notification.id}-toggle-bookmark`"
        @click="$emit('toggle-bookmarked', notification)"
      >
        {{ notification.state.is_bookmarked ? "Unbookmark" : "Bookmark" }}
      </va-button>
      <va-button
        size="small"
        preset="secondary"
        :data-testid="`notification-${notification.id}-toggle-archive`"
        @click="$emit('toggle-archived', notification)"
      >
        {{ notification.state.is_archived ? "Unarchive" : "Archive" }}
      </va-button>
    </div>
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
    You are about to open an untrusted link in a new tab. Proceed only if you trust the destination.
  </va-modal>
</template>

<script setup>
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});
defineEmits(["toggle-read", "toggle-archived", "toggle-bookmarked"]);
const showUntrustedLinkModal = ref(false);
const selectedUntrustedLink = ref(null);

function openLink(link) {
  if (link.open_in_new_tab) {
    window.open(link.href, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(link.href);
}

function handleLinkClick(link) {
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
</style>
