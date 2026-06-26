<template>
  <p class="text-sm text-slate-700 dark:text-slate-200">
    {{ props.record.eventType }} event not supported yet.
  </p>
</template>

<script setup>
const props = defineProps({
  record: {
    type: Object,
    required: true,
  },
});
</script>
