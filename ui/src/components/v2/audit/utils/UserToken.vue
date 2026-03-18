<template>
  <div
    class="min-w-0 max-w-48 truncate text-slate-900 dark:text-slate-100"
    :title="props.name"
  >
    <span v-if="props.id === authStore?.user?.subject_id"> you </span>
    <span v-else>
      {{ props.name }}
    </span>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();

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
