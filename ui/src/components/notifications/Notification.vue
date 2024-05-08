<template>
  <a class="notification-anchor" :href="props.to">
    <h6 class="va-h6" :data-testid="`notification-${notification.id}-label`">
      {{ props.notification.label }}
    </h6>
    <p :data-testid="`notification-${notification.id}-text`">
      {{ props.notification.text }}
    </p>
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
