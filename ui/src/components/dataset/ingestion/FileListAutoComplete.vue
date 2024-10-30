<template>
  <AutoComplete
    v-model:search-text="searchText"
    :placeholder="`Search directories in ${basePath}`"
    :data="props.options"
    :async="true"
    :display-by="'path'"
    @clear="emit('clear')"
    @select="
      (file) => {
        onFileSelect(file);
      }
    "
    :disabled="disabled"
    :label="'Dataset Path'"
    @open="emit('open')"
    @close="emit('close')"
  >
    <template #prependInner>
      <va-badge
        v-if="props.basePath"
        class="base-path-badge"
        :text="basePath"
        color="secondary"
      />
    </template>
  </AutoComplete>
</template>

<script setup>
const props = defineProps({
  disabled: { type: Boolean, default: false },
  basePath: { type: String },
  selected: { type: [String, Object] },
  searchText: { type: String, default: "" },
  options: { type: Array, default: () => [] },
  error: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:selected",
  "update:searchText",
  "filesRetrieved",
  "loading",
  "loaded",
  "clear",
  "open",
  "close",
]);

const searchText = computed({
  get: () => {
    return props.searchText;
  },
  set: (value) => {
    emit("update:searchText", value);
  },
});

const basePath = computed(() => {
  return props.basePath
    ? props.basePath.endsWith("/")
      ? props.basePath
      : props.basePath + "/"
    : "";
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
