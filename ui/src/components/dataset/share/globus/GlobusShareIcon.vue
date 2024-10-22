<template>
  <va-popover :message="props.status">
    <i-mdi-check-circle
      v-if="props.status == 'SUCCESS'"
      style="color: var(--va-success)"
    />

    <i-mdi-clock
      v-else-if="props.status == 'PENDING'"
      style="color: var(--va-warning)"
    />

    <i-mdi-progress-helper v-else style="color: var(--va-secondary)" />
  </va-popover>
</template>

<script setup>
const props = defineProps({
  status: String,
});
</script>
