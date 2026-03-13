<template>
  <component v-if="tokenComponent" :is="tokenComponent" :name="name" :id="id" />
  <span v-else class="font-semibold">
    {{ name }}
  </span>
</template>

<script setup>
import { computed } from "vue";
import CollectionToken from "./CollectionToken.vue";
import DatasetToken from "./DatasetToken.vue";

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
    case "dataset":
      return DatasetToken;
    case "collection":
      return CollectionToken;
    default:
      return null;
  }
});
</script>
