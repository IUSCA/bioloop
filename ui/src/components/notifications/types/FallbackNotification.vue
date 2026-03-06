<template>
  <div class="flex flex-col gap-1">
    <p v-if="props.notification.title" class="font-medium text-sm">
      {{ props.notification.title }}
    </p>
    <p v-if="props.notification.body" class="text-xs" style="color: var(--va-secondary)">
      {{ props.notification.body }}
    </p>
  </div>
</template>

<script setup>
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});
</script>
