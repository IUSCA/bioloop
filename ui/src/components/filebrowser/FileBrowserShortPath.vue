<template>
  <button
    class="va-link"
    :class="{ 'cursor-pointer': !isDir }"
    @click="isDir ? null : emit('click', parent)"
  >
    <div v-if="depth >= 4">
      <va-popover :message="isDir ? props.data.path : parent" placement="top">
        <span>
          {{ getShortPath(props.data.path, isDir).replaceAll("/", " / ") }}
        </span>
      </va-popover>
    </div>
    <div v-else>
      <span>
        {{ getShortPath(props.data.path, isDir).replaceAll("/", " / ") }}
      </span>
    </div>
  </button>
</template>

<script setup>
import { getParentPath, getShortPath } from "./fileBrowserUtils";

const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["click"]);

const isDir = computed(() => {
  return props.data?.filetype === "directory";
});

const parent = computed(() => {
  return getParentPath(props.data.path);
});

const depth = computed(() => {
  return (props.data.path || "").split("/").length;
});
</script>
