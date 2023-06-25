<template>
  <div class="flex items-center">
    <Icon
      :icon="datasetService.get_icon(props.type)"
      class="text-2xl flex-none mr-2 va-text-secondary"
      v-if="props.showIcon"
    />
    <span class="capitalize">
      {{ props.type?.toLowerCase()?.split("_")?.join(" ") }}
    </span>
  </div>
</template>

<script setup>
import datasetService from "@/services/dataset";

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
  showIcon: {
    type: Boolean,
    default: false,
  },
});
</script>
