<template>
  <div
    class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-solid bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100"
    :title="displayName"
  >
    <Icon :icon="constants.icons.collection" class="text-base" />
    <div class="min-w-0 truncate">
      <template v-if="props.link && collection?.id">
        <RouterLink
          :to="`/collections/${collection.id}`"
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
        Collection · {{ datasetCountLabel }}
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
      class="ml-1 hover:opacity-70 w-4 h-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
      @click="emit('remove')"
      aria-label="Remove collection"
    >
      <i-mdi-close />
    </button>
  </div>
</template>

<script setup>
import constants from "@/constants";
import { maybePluralize } from "@/services/utils";
const props = defineProps({
  collection: {
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
  () => props.collection?.name || `Collection ${props.collection?.id || ""}`,
);

const datasetCountLabel = computed(() => {
  const count = props.collection?._count?.datasets || 0;
  return maybePluralize(count, "dataset", { formatter: (v) => v });
});

const ownerName = computed(() => props.collection?.owner_group?.name || "");
</script>
