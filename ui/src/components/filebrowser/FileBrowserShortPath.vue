<template>
  <div
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
  </div>
</template>

<script setup>
const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["click"]);

function getShortPath(path, isDirectory) {
  const parts = path.split("/");

  if (!isDirectory) {
    if (parts.length >= 4) return `.../${parts.slice(-3, -1).join("/")}/`;
    return `${parts.slice(0, -1).join("/")}/`;
  } else {
    if (parts.length >= 3) `.../${parts.slice(-2).join("/")}`;
    return parts.join("/");
  }
}

const isDir = computed(() => {
  return props.data?.filetype === "directory";
});

const parent = computed(() => {
  const parts = props.data.path.split("/");
  return parts.slice(0, -1).join("/");
});

const depth = computed(() => {
  return props.data.path.split("/").length;
});
</script>
