<template>
  <div class="flex items-center">
    <Icon
      :icon="config.dataset.types[props.type]?.icon"
      class="text-2xl flex-none mr-2 va-text-secondary"
      v-if="props.showIcon"
    />
    <span class="capitalize" v-if="props.showType">
      {{ props.type?.toLowerCase()?.split("_")?.join(" ") }}
    </span>
  </div>
</template>

<script setup>
import config from "@/config";

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
  showIcon: {
    type: Boolean,
    default: false,
  },
  showType: {
    type: Boolean,
    default: true,
  },
});
</script>
