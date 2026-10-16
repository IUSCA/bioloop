<template>
  <va-popover :message="props.status">
    <Icon icon="mdi:check-circle"
      v-if="props.status == 'SUCCESS'"
      style="color: var(--va-success)"
    />

    <Icon icon="mdi:clock"
      v-else-if="props.status == 'STARTED'"
      style="color: var(--va-warning)"
    />

    <Icon icon="mdi:alert-circle"
      v-else-if="props.status == 'FAILURE'"
      style="color: var(--va-danger)"
    />

    <Icon icon="mdi:close-circle"
      v-else-if="props.status == 'REVOKED'"
      style="color: rgb(102, 102, 102)"
    />

    <Icon icon="mdi:clock-time-twelve-outline"
      v-else-if="props.status == 'PENDING'"
      style="color: var(--va-primary)"
    />

    <Icon icon="mdi:progress-helper" v-else style="color: var(--va-secondary)" />
  </va-popover>
</template>

<script setup>
const props = defineProps({
  status: String,
});
</script>
