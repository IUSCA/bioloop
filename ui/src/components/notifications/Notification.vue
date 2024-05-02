<template>
  <a class="notification-anchor" :href="notification.to || '#'">
    <h6 class="va-h6">{{ notification.label }}</h6>
    <p>{{ notification.text }}</p>
  </a>
</template>

<script setup>
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});

const notification = computed(() => ({
  ...props.notification,
  to: `/testNotification`,
}));
</script>

<style lang="scss" scoped>
.notification-anchor {
  color: var(--va-text-primary);
}
</style>
