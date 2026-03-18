<template>
  <div
    class="min-w-0 max-w-48 truncate font-semibold text-slate-900 dark:text-slate-100"
    :title="props.name"
  >
    <RouterLink :to="`/v2/groups/${props.id}`" v-if="props.id">
      {{ props.name }}
    </RouterLink>
    <span v-else>
      {{ props.name }}
    </span>
  </div>
</template>

<script setup>
const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  id: {
    type: String,
    required: true,
  },
});
</script>
