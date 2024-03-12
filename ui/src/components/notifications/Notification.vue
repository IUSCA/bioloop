<template>
  <a
    class="notification-anchor"
    :href="props.notification.to || '#'"
    @click="props.notification.onClick"
  >
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
});

console.log(props.notification);
</script>

<style lang="scss" scoped>
.notification-anchor {
  color: var(--va-text-primary);
}
</style>
