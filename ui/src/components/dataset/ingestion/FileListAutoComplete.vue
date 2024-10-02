<template>
  <!--    @update:search-text="searchFiles"-->
  <AutoComplete
    v-model:search-text="searchText"
    :placeholder="`Search directories in ${basePath}`"
    :data="props.options"
    :async="true"
    :display-by="'path'"
    @clear="emit('clear')"
    @select="
      (file) => {
        // console.log('@select: selected file:', file);
        onFileSelect(file);
      }
    "
    :disabled="disabled"
    :label="'Dataset Path'"
  >
    <va-badge
      v-if="props.basePath"
      class="base-path-badge"
      :text="basePath"
      color="secondary"
    >
    </va-badge>
  </AutoComplete>
</template>

<script setup>
const props = defineProps({
  disabled: { type: Boolean, default: false },
  basePath: { type: String },
  selected: { type: [String, Object] },
  searchText: { type: String, default: "" },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits([
  // "select",
  "update:selected",
  "update:searchText",
  "filesRetrieved",
  "loading",
  "loaded",
  "clear",
]);

const searchText = computed({
  get: () => {
    return props.searchText;
  },
  set: (value) => {
    emit("update:searchText", value);
  },
});

// const searchText = ref("");
const basePath = computed(() => {
  return props.basePath.endsWith("/") ? props.basePath : props.basePath + "/";
});

const onFileSelect = (file) => {
  emit(
    "update:searchText",
    file.path.slice(file.path.indexOf(basePath.value) + basePath.value.length),
  );
  emit("update:selected", file);
};
</script>

<style lang="scss" scoped>
.base-path-badge {
  --va-badge-font-size: 0.8em;
  --va-badge-line-height: 1.8;
}
</style>
