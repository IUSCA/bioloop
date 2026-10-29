<template>
  <va-popover :message="props.status">
    <i-mdi-check-circle
      v-if="props.status == 'SUCCESS'"
      style="color: var(--va-success)"
    />

    <i-mdi-clock
      v-else-if="props.status == 'STARTED'"
      style="color: var(--va-warning)"
    />

    <i-mdi-alert-circle
      v-else-if="props.status == 'FAILURE'"
      style="color: var(--va-danger)"
    />

    <i-mdi-close-circle
      v-else-if="props.status == 'REVOKED'"
      style="color: rgb(102, 102, 102)"
    />

    <i-mdi-clock-time-twelve-outline
      v-else-if="props.status == 'PENDING'"
      style="color: var(--va-primary)"
    />

    <i-mdi-progress-helper v-else style="color: var(--va-secondary)" />
  </va-popover>
</template>

<script setup>
const props = defineProps({
  status: String,
});
</script>
