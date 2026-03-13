<template>
  <p>{{ props.record.eventType }} event not supported yet.</p>
</template>

<script setup>
const props = defineProps({
  record: {
    type: Object,
    required: true,
  },
});
</script>
