<template>
  <component v-if="tokenComponent" :is="tokenComponent" :name="name" :id="id" />
  <span v-else class="font-semibold text-slate-900 dark:text-slate-100">
    {{ name }}
  </span>
</template>

<script setup>
import { computed } from "vue";
import GroupToken from "./GroupToken.vue";
import UserToken from "./UserToken.vue";

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  id: {
    type: String,
    required: true,
  },
});

const tokenComponent = computed(() => {
  switch (props.type?.toLowerCase()) {
    case "user":
      return UserToken;
    case "group":
      return GroupToken;
    default:
      return null;
  }
});
</script>
