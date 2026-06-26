<template>
  <div
    class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-solid bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100"
  >
    <GroupIcon :group="props.group" size="sm" />
    <div class="flex flex-col">
      <span class="font-medium">{{ props.group.name }}</span>
      <span class="text-xs opacity-70">
        <template v-if="props.group.metadata?.type">
          {{ props.group.metadata.type }} ·
        </template>
        <span v-if="props.group._count?.members != null">
          {{
            maybePluralize(props.group._count.members, "member", {
              formatter: number_formatter.format,
            })
          }}
        </span>
      </span>
    </div>
    <button
      v-if="props.removable"
      class="ml-1 hover:opacity-70 w-4 h-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
      @click="emit('remove')"
    >
      <i-mdi-close class="" />
    </button>
  </div>
</template>

<script setup>
import { maybePluralize } from "@/services/utils";
import GroupIcon from "./GroupIcon.vue";

const props = defineProps({
  group: {
    type: Object,
    required: true,
  },
  removable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);

const number_formatter = Intl.NumberFormat("en", { notation: "compact" });
</script>
