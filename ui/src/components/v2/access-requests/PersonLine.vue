<template>
  <div v-if="props.person" class="flex items-center gap-2 min-w-0">
    <UserAvatar
      :username="props.person.username"
      :name="props.person.name"
      class="shrink-0"
    />
    <div class="min-w-0">
      <p class="text-sm font-medium truncate">
        {{ props.person.name || props.person.username }}
      </p>
      <p v-if="props.person.email" class="text-xs va-text-secondary truncate">
        {{ props.person.email }}
      </p>
    </div>
  </div>
  <span v-else class="va-text-secondary">—</span>
</template>

<script setup>
/**
 * An avatar with a name and an email underneath, left-aligned.
 *
 * The requester and the reviewer are rendered identically, which is the point: a reader
 * comparing the two should not have to work out whether a difference in layout means
 * something.
 */
import UserAvatar from "@/components/utils/UserAvatar.vue";

const props = defineProps({
  person: {
    type: Object,
    default: null,
  },
});
</script>
