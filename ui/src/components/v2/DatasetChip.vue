<template>
  <div
    class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-solid bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
    :title="displayName"
  >
    <Icon :icon="constants.icons.dataset" class="text-base" />
    <div class="min-w-0 truncate">
      <template v-if="props.link && dataset?.id">
        <RouterLink
          :to="`/datasets/${dataset.id}`"
          class="font-medium hover:underline block max-w-[12rem] truncate"
          :title="displayName"
        >
          {{ displayName }}
        </RouterLink>
      </template>
      <template v-else>
        <span
          class="font-medium block max-w-[12rem] truncate"
          :title="displayName"
        >
          {{ displayName }}
        </span>
      </template>
      <div class="text-xs opacity-70">
        Dataset · {{ formattedSize }}
        <span v-if="dataset?.rows"> · {{ dataset.rows }} rows</span>
        <span v-if="ownerName" class="inline-flex items-center gap-1">
          · Owned by
          <span class="max-w-[8rem] truncate" :title="ownerName">
            {{ ownerName }}
          </span>
        </span>
      </div>
    </div>

    <button
      v-if="props.removable"
      class="ml-1 hover:opacity-70 w-4 h-4 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
      @click="emit('remove')"
      aria-label="Remove dataset"
    >
      <i-mdi-close />
    </button>
  </div>
</template>

<script setup>
import constants from "@/constants";
import { formatBytes } from "@/services/utils";
const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
  link: {
    type: Boolean,
    default: false,
  },
  removable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);

const displayName = computed(
  () => props.dataset?.name || `Dataset ${props.dataset?.id || ""}`,
);

const formattedSize = computed(() => {
  const sizeValue = props.dataset?.size || props.dataset?.bytes || 0;
  return sizeValue ? formatBytes(sizeValue) : "Unknown size";
});
const ownerName = computed(() => props.dataset?.owner_group?.name || "");
</script>
