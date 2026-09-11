<template>
  <span class="flex items-center gap-1.5">
    <i-mdi-check-circle-outline
      v-if="props.allowed"
      class="text-green-600 dark:text-green-400"
    />
    <i-mdi-close-circle-outline
      v-else
      class="text-gray-400 dark:text-gray-500"
    />
    {{ props.allowed ? "Allowed" : "Not allowed" }}
  </span>
</template>

<script setup>
/**
 * The member-uploads value in an Overview band, rendered the same whether or not the
 * caller may change it.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  allowed: { type: Boolean, default: false },
});
</script>
