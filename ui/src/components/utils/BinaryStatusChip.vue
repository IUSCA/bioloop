<template>
  <va-chip size="small" :color="props.status ? 'success' : 'secondary'">
    <Icon
      :icon="props.icons[index]"
      v-if="props.icons.length > 0"
      class="text-lg"
    />
    <span class="uppercase" v-else>
      {{ props.labels[index] }}
    </span>
  </va-chip>
</template>

<script setup>
const props = defineProps({
  status: {
    type: Boolean,
  },
  labels: {
    type: Array,
    default: () => ["disabled", "enabled"],
  },
  icons: {
    type: Array,
    default: () => [],
  },
});

const index = computed(() => {
  return Number(props.status);
});
</script>
