<template>
  <a class="notification-anchor" :href="props.to">
    <h6 class="va-h6">{{ props.notification.label }}</h6>
    <p>{{ props.notification.text }}</p>
  </a>
</template>

<script setup>
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
  to: {
    type: String,
    default: "#",
  },
});
</script>

<style lang="scss" scoped>
.notification-anchor {
  color: var(--va-text-primary);
}
</style>
