<template>
  <div
    class="min-w-0 max-w-48 truncate font-semibold text-slate-900 dark:text-slate-100"
    :title="name"
  >
    <RouterLink :to="`/datasets/${id}`" v-if="id">
      {{ name }}
    </RouterLink>
    <span v-else>
      {{ name }}
    </span>
  </div>
</template>

<script setup>
defineProps({
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
