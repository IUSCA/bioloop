<template>
  <DatasetNotification
    v-if="props.notification.type === 'DATASET'"
    :notification="props.notification"
  />
</template>

<script setup>
const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
});
</script>
