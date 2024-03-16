<template>
  <DatasetNotification
    v-if="props.notification.type === 'INCOMING_DUPLICATE_DATASET'"
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
