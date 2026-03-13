<template>
  <div class="min-w-0 max-w-36 truncate" :title="props.name">
    <RouterLink v-if="props.id" :to="`/users/${props.id}`">
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
  },
});
</script>
