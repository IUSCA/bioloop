<template>
  <div
    class="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-solid text-sm bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100"
  >
    <UserAvatar :username="user.username" :name="user.name" />
    <div class="flex flex-col min-w-0 max-w-[200px]">
      <span class="truncate" :title="props.user.name || props.user.username">
        {{ props.user.name || props.user.username }}
      </span>
      <span class="truncate text-xs opacity-70" :title="props.user.email">
        {{ props.user.email }}
      </span>
    </div>
    <button
      v-if="props.removable"
      class="ml-1 hover:opacity-70 w-4 text-blue-600 dark:text-blue-400"
      @click="emit('remove')"
    >
      <i-mdi-close class="" />
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
  removable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);
</script>
